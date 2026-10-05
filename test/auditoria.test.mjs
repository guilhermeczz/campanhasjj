import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
let admin, vendedor, marca, produto, auditSQL;
async function anon(sql, params = []) {
  await db.exec('set role anon');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function rpc(name, args = []) {
  return (await anon(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)).rows[0].result;
}
const listar = (pagina = 1, busca = '', token = admin) => rpc('jj_auditoria_listar', [token, pagina, busca]);
const detalhe = (id, pagina = 1, token = admin) => rpc('jj_auditoria_detalhe', [token, id, pagina]);
const importar = (linhas, arquivo = 'vendas.xlsx') => rpc('jj_importar_com_auditoria', [admin, JSON.stringify(linhas), arquivo]);
const desfazer = (id, token = admin, confirmar = true) => rpc('jj_auditoria_desfazer', [token, id, confirmar]);
const vendas = async () => (await db.query('select * from public.vendas order by item_id')).rows;
function venda(overrides = {}) {
  return { item_id: 'NF-1', vendedor: 'joao.silva', produto: 'AUD-01', quantidade: 1,
    marca_id: marca, data_faturamento: '2026-11-10T12:00:00-03:00', valor_bruto: 100,
    valor_devolucao: 0, valor_cancelamento: 0, cliente_id: 'CLIENTE', status: 'faturado', ...overrides };
}
before(async () => {
  await db.exec('create role anon; create role authenticated; grant usage on schema public to anon,authenticated;');
  for (const file of ['schema.sql', 'migration_copa.sql', 'migration_campanhas_por_marca.sql', 'migration_backend_seguro.sql', 'migration_auditoria_importacoes.sql']) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8');
    await db.exec(sql);
    if (file === 'migration_auditoria_importacoes.sql') auditSQL = sql;
  }
  admin = (await rpc('jj_login', ['admin', '123456'])).token;
  vendedor = (await rpc('jj_login', ['joao.silva', '111111'])).token;
  marca = (await rpc('jj_bootstrap', [admin])).marcas.find(m => m.nome === 'WAGO').id;
  produto = await rpc('jj_salvar', [admin, 'produtos', JSON.stringify({ nome: 'Produto Auditoria', codigo_externo: 'AUD-01', marca_id: marca, preco_venda: 100, pontos_por_real: 1.5, ativo: true })]);
});
beforeEach(async () => {
  await db.exec('truncate jj_private.importacao_desfazer,jj_private.importacoes_vendas,jj_private.importacao_previas; truncate public.vendas;');
  await rpc('jj_salvar', [admin, 'produtos', JSON.stringify({ ...produto, pontos_por_real: 1.5 })]);
});
after(async () => db.close());

test('auditoria: registra responsável autenticado, origem da linha e pontos calculados no banco', async () => {
  const result = await importar([venda({ linha_planilha: 7, pontos: 999, autor_nome: 'Invasor' })], 'outubro.xlsx');
  assert.equal(result.inseridas, 1);
  const historico = await listar();
  const log = historico.registros[0];
  assert.equal(log.autor_usuario, 'admin');
  assert.equal(log.total_pontos, 150);
  assert.equal(log.valor_liquido, 100);
  assert.equal(log.arquivo, 'outubro.xlsx');
  assert.equal(log.pode_desfazer, true);
  const preview = await detalhe(result.auditoria_id);
  assert.equal(preview.linhas[0][preview.colunas.indexOf('linha')], 7);
  assert.equal(preview.linhas[0][preview.colunas.indexOf('pontos')], 150);
  assert.equal(preview.importacao.previa_hash, undefined);
  assert.ok(historico.bytes_previas > 0);
});

test('auditoria: vendedor e sessão inválida não consultam nem desfazem; tabelas e núcleo privados', async () => {
  const { auditoria_id: id } = await importar([venda()]);
  await assert.rejects(listar(1, '', vendedor), /Somente a diretoria/);
  await assert.rejects(detalhe(id, 1, vendedor), /Somente a diretoria/);
  await assert.rejects(desfazer(id, vendedor), /Somente a diretoria/);
  await assert.rejects(listar(1, '', 'invalido'), /Sessão inválida/i);
  await assert.rejects(desfazer(id, 'invalido'), /Sessão inválida/i);
  for (const table of ['importacoes_vendas', 'importacao_previas', 'importacao_desfazer']) {
    await assert.rejects(anon(`select * from jj_private.${table}`), /permission denied/i);
    await assert.rejects(anon(`delete from jj_private.${table}`), /permission denied/i);
  }
  await assert.rejects(anon('select jj_private.importar_vendas($1,$2)', [admin, '[]']), /permission denied/i);
  const boot = await rpc('jj_bootstrap', [vendedor]);
  assert.equal(JSON.stringify(boot).includes('vendas.xlsx'), false);
  assert.equal((await vendas()).length, 1);
});

test('auditoria: reimportação gera novo registro e reutiliza prévia idêntica', async () => {
  const a = await importar([venda()]);
  const b = await importar([venda()], 'mesmo-conteudo.xlsx');
  assert.notEqual(a.auditoria_id, b.auditoria_id);
  const history = await listar();
  assert.equal(history.total, 2);
  assert.equal(history.previas_unicas, 1);
  assert.equal(b.atualizadas, 1);
  assert.equal(history.registros.find(r => r.id === a.auditoria_id).pode_desfazer, false);
  assert.equal((await detalhe(a.auditoria_id)).linhas[0][12], 150);
});

test('auditoria: prévia imutável após edição de produto; desfazer rejeita conflito posterior', async () => {
  const { auditoria_id: id } = await importar([venda()]);
  await rpc('jj_salvar', [admin, 'produtos', JSON.stringify({ ...produto, pontos_por_real: 2 })]);
  assert.equal(Number((await vendas())[0].pontos), 200);
  assert.equal((await detalhe(id)).linhas[0][12], 150);
  await assert.rejects(desfazer(id), /alteradas após a importação/);
  assert.equal(Number((await vendas())[0].pontos), 200);
  assert.equal((await detalhe(id)).importacao.desfeita_em, null);
});

test('desfazer: restaura venda atualizada inteira, remove nova e preserva venda não envolvida', async () => {
  await importar([venda(), venda({ item_id: 'FORA' })]);
  const original = await vendas();
  const { auditoria_id: id } = await importar([venda({ valor_bruto: 500, vendedor: 'maria.souza' }), venda({ item_id: 'NOVA' })]);
  const resultado = await desfazer(id);
  assert.deepEqual(resultado, { ok: true, removidas: 1, restauradas: 1 });
  assert.deepEqual(await vendas(), original);
  const log = (await detalhe(id)).importacao;
  assert.ok(log.desfeita_em);
  assert.equal(log.desfeita_por_usuario, 'admin');
  assert.equal(log.pode_desfazer, false);
  assert.equal((await detalhe(id)).linhas[0][12], 750, 'prévia preservada mesmo desfeita');
  assert.equal((await listar()).registros.filter(r => r.pode_desfazer).length, 0);
  assert.equal((await listar()).bytes_restauracao, 0);
  const boot = await rpc('jj_bootstrap', [vendedor]);
  assert.deepEqual(boot.vendas, []);
  assert.deepEqual(boot.pontuacoes, []);
  assert.equal(boot.rankings.length, 1);
  assert.equal(boot.rankings[0].posicao, 1);
  assert.deepEqual(Object.keys(boot.rankings[0]).sort(), ['campanha_id', 'marca_id', 'marca_nome', 'posicao']);
});

test('desfazer: confirmação obrigatória, última importação somente e repetição rejeitada', async () => {
  const a = await importar([venda()]);
  const b = await importar([venda({ valor_bruto: 200 })]);
  await assert.rejects(desfazer(b.auditoria_id, admin, false), /Confirme/);
  await assert.rejects(desfazer(a.auditoria_id), /última importação/);
  assert.equal(Number((await vendas())[0].valor_bruto), 200);
  await desfazer(b.auditoria_id);
  await assert.rejects(desfazer(b.auditoria_id), /última importação/);
  await assert.rejects(desfazer(a.auditoria_id), /última importação/);
  assert.equal(Number((await vendas())[0].valor_bruto), 100);
});

test('desfazer: detecta alteração no produto anterior mesmo quando o reenvio trocou de produto', async () => {
  const outro = await rpc('jj_salvar', [admin, 'produtos', JSON.stringify({ nome: 'Outro Produto', codigo_externo: 'AUD-02', marca_id: marca, preco_venda: 50, pontos_por_real: 1, ativo: true })]);
  await importar([venda()]);
  const { auditoria_id: id } = await importar([venda({ produto: outro.codigo_externo })]);
  await rpc('jj_salvar', [admin, 'produtos', JSON.stringify({ ...produto, pontos_por_real: 3 })]);
  await assert.rejects(desfazer(id), /alteradas após a importação/);
  assert.equal((await vendas())[0].produto_id, outro.id);
});

test('auditoria: 5.000 linhas ficam completas na prévia e podem ser desfeitas', async () => {
  const { auditoria_id: id } = await importar(Array.from({ length: 5000 }, (_, i) => venda({ item_id: `LOTE-${i}` })));
  const ultima = await detalhe(id, 50);
  assert.equal(ultima.paginas, 50);
  assert.equal(ultima.linhas.length, 100);
  assert.equal(ultima.linhas[99][0], 5001);
  assert.equal(ultima.importacao.total_pontos, 750000);
  await desfazer(id);
  assert.equal((await vendas()).length, 0);
});

test('desfazer: funciona na primeira importação e permite importar novamente após reversão', async () => {
  const a = await importar([venda()]);
  await desfazer(a.auditoria_id);
  assert.equal((await vendas()).length, 0);
  const b = await importar([venda({ valor_bruto: 80 })]);
  assert.equal(b.inseridas, 1);
  assert.equal((await listar()).total, 2);
  assert.equal((await detalhe(b.auditoria_id)).importacao.pode_desfazer, true);
});

test('auditoria: falha é atômica e preserva reserva anterior de desfazer', async () => {
  const a = await importar([venda()]);
  const original = await vendas();
  await assert.rejects(importar([venda({ valor_bruto: 200 }), venda({ item_id: 'NOVA', produto: 'inexistente' })]), /produto não cadastrado/i);
  assert.deepEqual(await vendas(), original);
  assert.equal((await listar()).total, 1);
  assert.equal((await listar()).previas_unicas, 1);
  await desfazer(a.auditoria_id);
  assert.equal((await vendas()).length, 0);
});

test('auditoria: paginação de 101 linhas e histórico com 21 uploads, busca literal', async () => {
  const a = await importar(Array.from({ length: 101 }, (_, i) => venda({ item_id: `NF-${i}`, linha_planilha: i + 2 })));
  assert.equal((await detalhe(a.auditoria_id)).linhas.length, 100);
  const page2 = await detalhe(a.auditoria_id, 2);
  assert.equal(page2.paginas, 2);
  assert.equal(page2.linhas.length, 1);
  assert.equal(page2.linhas[0][0], 102);
  for (let i = 0; i < 20; i++) await importar([venda()], `arquivo-${i}.xlsx`);
  assert.equal((await listar()).registros.length, 20);
  assert.equal((await listar(2)).registros.length, 1);
  assert.equal((await listar()).total, 21);
  assert.equal((await listar(1, 'ARQUIVO-19')).total, 1);
  assert.equal((await listar(1, '%')).total, 0);
  assert.equal((await listar(1, 'admin')).total, 21);
});

test('auditoria: RPC legada também registra e migrations reaplicadas preservam histórico', async () => {
  const result = await rpc('jj_importar', [admin, JSON.stringify([venda()])]);
  assert.deepEqual(result, { total: 1, inseridas: 1, atualizadas: 0 });
  await db.exec(auditSQL);
  assert.equal((await listar()).total, 1);
  await db.exec(await readFile(new URL('../supabase/migration_backend_seguro.sql', import.meta.url), 'utf8'));
  await db.exec(auditSQL);
  await importar([venda({ linha_planilha: 'não numérica' })]);
  assert.equal((await listar()).total, 2);
  assert.equal((await detalhe((await listar()).registros[0].id)).linhas[0][0], 2);
});
