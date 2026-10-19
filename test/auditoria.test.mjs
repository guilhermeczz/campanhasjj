import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
let admin, joao, campanha;

async function anon(sql, params = []) {
  await db.exec('set role anon');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function rpc(name, args = []) {
  return (await anon(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)).rows[0].result;
}
const listar = (pagina = 1, busca = '', token = admin) => rpc('jj_auditoria_listar', [token, pagina, busca]);
const detalhe = (id, pagina = 1, token = admin) => rpc('jj_auditoria_detalhe', [token, id, pagina]);
const importar = (linhas, arquivo = 'vendas.xlsx', token = admin) => rpc('jj_importar', [token, JSON.stringify(linhas.map(l => ({ ...l, arquivo })))]);
const desfazer = (id, token = admin, confirmar = true) => rpc('jj_auditoria_desfazer', [token, id, confirmar]);
const vendas = async () => (await db.query('select vendedor_nome, valor_vendido::float8 as valor from public.vendas order by vendedor_nome')).rows;
function venda(overrides = {}) {
  return { vendedor: 'joao.silva', categoria: 'Tubos', valor_vendido: 100,
    campanha_id: campanha, data_faturamento: '2026-11-10T12:00:00-03:00', ...overrides };
}

before(async () => {
  await db.exec('create role anon; create role authenticated; grant usage on schema public to anon, authenticated;');
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  admin = (await rpc('jj_login', ['admin', '123456'])).token;
  await rpc('jj_salvar', [admin, 'vendedores', JSON.stringify({ username: 'joao.silva', nome: 'João Silva', senha: '111111', role: 'vendedor' })]);
  await rpc('jj_salvar', [admin, 'vendedores', JSON.stringify({ username: 'maria.souza', nome: 'Maria Souza', senha: '222222', role: 'vendedor' })]);
  joao = (await rpc('jj_login', ['joao.silva', '111111'])).token;
  await rpc('jj_salvar', [admin, 'categorias', JSON.stringify({ nome: 'Tubos', ativa: true })]);
  campanha = (await rpc('jj_salvar', [admin, 'campanhas', JSON.stringify({ nome: 'Verão 2026', data_inicio: '2026-10-01', data_fim: '2026-12-31' })])).id;
});
beforeEach(async () => { await db.exec('reset role; truncate public.vendas, public.importacoes;'); });
after(async () => db.close());

test('registra responsável, arquivo, totais e prévia com valores', async () => {
  const result = await importar([venda({ valor_vendido: 150 }), venda({ vendedor: 'maria.souza', valor_vendido: 50 })], 'outubro.xlsx');
  assert.equal(result.inseridas, 2);
  const historico = await listar();
  const log = historico.registros[0];
  assert.equal(log.autor_username, 'admin');
  assert.equal(log.arquivo, 'outubro.xlsx');
  assert.equal(log.total, 2);
  assert.equal(Number(log.valor_total), 200);
  assert.equal(log.pode_desfazer, true);
  const preview = await detalhe(result.auditoria_id);
  assert.equal(preview.linhas.length, 2);
  assert.equal(preview.linhas[0].categoria, 'Tubos');
  assert.equal(Number(preview.linhas[0].valor_vendido), 150);
  assert.equal(preview.importacao.arquivo, 'outubro.xlsx');
});

test('vendedor e sessão inválida não consultam nem desfazem; importacoes protegida', async () => {
  const { auditoria_id: id } = await importar([venda()]);
  await assert.rejects(listar(1, '', joao), /diretoria/);
  await assert.rejects(detalhe(id, 1, joao), /diretoria/);
  await assert.rejects(desfazer(id, joao), /diretoria/);
  await assert.rejects(listar(1, '', 'invalido'), /Sessão expirada/);
  await assert.rejects(anon('select * from public.importacoes'), /permission denied/);
  assert.equal((await vendas()).length, 1);
});

test('desfazer remove apenas as vendas daquela importação e preserva as demais', async () => {
  await importar([venda({ vendedor: 'maria.souza', valor_vendido: 500 })]);
  const anterior = await vendas();
  const { auditoria_id: id } = await importar([venda({ valor_vendido: 999 }), venda({ vendedor: 'maria.souza', valor_vendido: 111 })]);
  const resultado = await desfazer(id);
  assert.equal(resultado.removidas, 2);
  assert.deepEqual(await vendas(), anterior);
  const log = (await detalhe(id)).importacao;
  assert.ok(log.desfeita_em);
  assert.equal(log.desfeita_por_nome, 'CEO / Admin');
  assert.equal((await listar()).registros.find(r => r.id === id).pode_desfazer, false);
});

test('desfazer exige confirmação, somente a última importação e uma única vez', async () => {
  const a = await importar([venda()]);
  const b = await importar([venda({ valor_vendido: 200 })]);
  await assert.rejects(desfazer(b.auditoria_id, admin, false), /Confirme/);
  await assert.rejects(desfazer(a.auditoria_id), /última importação/);
  await desfazer(b.auditoria_id);
  await assert.rejects(desfazer(b.auditoria_id), /já foi desfeita/);
  assert.equal((await vendas())[0].valor, 100);
});

test('importação rejeitada é atômica e não gera registro', async () => {
  const a = await importar([venda()]);
  const anterior = await vendas();
  await assert.rejects(importar([venda({ valor_vendido: 200 }), venda({ categoria: 'inexistente' })]), /não cadastrada/);
  assert.deepEqual(await vendas(), anterior);
  assert.equal((await listar()).total, 1);
  assert.ok(a.auditoria_id);
});

test('prévia paginada, histórico paginado e busca literal', async () => {
  const a = await importar(Array.from({ length: 101 }, (_, i) => venda({ valor_vendido: i + 1 })), 'lote-grande.xlsx');
  assert.equal((await detalhe(a.auditoria_id)).linhas.length, 20);
  const page2 = await detalhe(a.auditoria_id, 2);
  assert.equal(page2.paginas, 6);
  assert.equal(page2.linhas.length, 20);
  assert.equal(page2.linhas[0].linha, 21);
  for (let i = 0; i < 20; i++) await importar([venda()], `arquivo-${i}.xlsx`);
  assert.equal((await listar()).registros.length, 10);
  assert.equal((await listar()).total, 21);
  assert.equal((await listar(3)).registros.length, 1);
  assert.equal((await listar(1, 'lote-grande')).total, 1);
  assert.equal((await listar(1, '%')).total, 0);
  assert.equal((await listar(1, 'admin')).total, 21);
});

test('5.000 linhas ficam completas na prévia e podem ser desfeitas', async () => {
  const { auditoria_id: id } = await importar(Array.from({ length: 5000 }, (_, i) => venda({ valor_vendido: 10 })), 'grande.xlsx');
  const ultima = await detalhe(id, 250);
  assert.equal(ultima.paginas, 250);
  assert.equal(ultima.linhas.length, 20);
  assert.equal(Number((await listar()).registros[0].valor_total), 50000);
  await desfazer(id);
  assert.equal((await vendas()).length, 0);
});
