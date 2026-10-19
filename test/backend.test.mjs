import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// PostgreSQL real compilado para WASM, com pgcrypto e o mesmo schema.sql do Supabase.
// Cada RPC é executada como anon: SECURITY DEFINER, grants e privacidade são exercitados.
const db = new PGlite({ extensions: { pgcrypto } });
let admin, joao, maria, pedro, carlos, campanha, categorias = {}, vendedores = {};

async function anon(sql, params = []) {
  await db.exec('set role anon');
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}
async function rpc(name, args = []) {
  const { rows } = await anon(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args);
  return rows[0].result;
}
async function boot(token = admin) { return rpc('jj_bootstrap', [token]); }
async function importar(linhas, token = admin) { return rpc('jj_importar', [token, JSON.stringify(linhas)]); }
function venda(overrides = {}) {
  return { vendedor: 'joao.silva', categoria: 'Tubos', valor_vendido: 1000,
    campanha_id: campanha, data_faturamento: '2026-11-10T12:00:00-03:00', ...overrides };
}
async function ranking() { return (await boot()).rankings.slice().sort((a, b) => a.posicao - b.posicao); }
async function contarVendas() { return (await db.query('select count(*)::int as n from public.vendas')).rows[0].n; }
async function resumo(token = admin) { return rpc('jj_resumo_campanha', [token, campanha]); }
async function evolucao(vendedorId = null, token = admin) { return rpc('jj_evolucao_campanha', [token, campanha, vendedorId]); }
async function criarVendedor(username, nome, senha) {
  return rpc('jj_salvar', [admin, 'vendedores', JSON.stringify({ username, nome, senha, role: 'vendedor', ativo: true })]);
}

before(async () => {
  await db.exec('create role anon; create role authenticated; grant usage on schema public to anon, authenticated;');
  const sql = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  try { await db.exec(sql); }
  catch (error) { throw new Error(`Falha no schema.sql: ${error.message} (código ${error.code}, posição ${error.position})`); }
  admin = (await rpc('jj_login', ['admin', '123456'])).token;
  assert.ok(admin, 'login do admin falhou');
  await criarVendedor('joao.silva', 'João Silva', '111111');
  await criarVendedor('maria.souza', 'Maria Souza', '222222');
  await criarVendedor('pedro', 'Pedro', '333333');
  await criarVendedor('carlos', 'Carlos', '444444');
  joao = (await rpc('jj_login', ['joao.silva', '111111'])).token;
  maria = (await rpc('jj_login', ['maria.souza', '222222'])).token;
  for (const nome of ['Tubos', 'Conexões', 'Elétrica']) {
    const categoria = await rpc('jj_salvar', [admin, 'categorias', JSON.stringify({ nome, ativa: true })]);
    categorias[nome] = categoria.id;
  }
  campanha = (await rpc('jj_salvar', [admin, 'campanhas', JSON.stringify({
    nome: 'Verão 2026', descricao: '', data_inicio: '2026-10-01', data_fim: '2026-12-31',
    premio_1: 2000, premio_2: 1500, premio_3: 500
  })])).id;
  const data = await boot();
  vendedores = Object.fromEntries(data.vendedores.map(v => [v.username, v.id]));
});
beforeEach(async () => { await db.exec('reset role; truncate public.vendas, public.importacoes;'); });
after(async () => { await db.close(); });

test('importa vendas e soma o valor vendido por categoria', async () => {
  const result = await importar([venda({ valor_vendido: 1000 }), venda({ valor_vendido: 500, categoria: 'Conexões' })]);
  assert.equal(result.inseridas, 2);
  assert.equal(result.total, 2);
  const r = await boot();
  const linhas = r.rankings.filter((x) => x.campanha_id === campanha && x.vendedor_id === vendedores['joao.silva']);
  assert.equal(linhas.length, 2);
  const tubos = linhas.find((x) => x.categoria_nome === 'Tubos');
  const conexoes = linhas.find((x) => x.categoria_nome === 'Conexões');
  assert.equal(Number(tubos.total_vendido), 1000);
  assert.equal(Number(tubos.itens), 1);
  assert.equal(tubos.posicao, 1);
  assert.equal(Number(conexoes.total_vendido), 500);
  assert.equal(conexoes.posicao, 1);
});

test('ranking é independente por categoria', async () => {
  await importar([
    venda({ vendedor: 'joao.silva', categoria: 'Tubos', valor_vendido: 1000 }),
    venda({ vendedor: 'maria.souza', categoria: 'Tubos', valor_vendido: 3000 }),
    venda({ vendedor: 'joao.silva', categoria: 'Conexões', valor_vendido: 5000 }),
    venda({ vendedor: 'maria.souza', categoria: 'Conexões', valor_vendido: 2000 })
  ]);
  const r = await ranking();
  assert.deepEqual(r.filter((x) => x.categoria_nome === 'Tubos').map((x) => x.vendedor_nome), ['Maria Souza', 'João Silva']);
  assert.deepEqual(r.filter((x) => x.categoria_nome === 'Conexões').map((x) => x.vendedor_nome), ['João Silva', 'Maria Souza']);
  assert.equal(r.find((x) => x.categoria_nome === 'Tubos' && x.vendedor_nome === 'Maria Souza').posicao, 1);
  assert.equal(r.find((x) => x.categoria_nome === 'Conexões' && x.vendedor_nome === 'Maria Souza').posicao, 2);
});

test('uma linha inválida desfaz a importação inteira', async () => {
  await assert.rejects(importar([venda(), venda({ vendedor: 'nao.existe' })]), /não encontrado ou inativo/);
  assert.equal(await contarVendas(), 0);
});

test('categoria não cadastrada bloqueia a linha e nada é gravado', async () => {
  await assert.rejects(importar([venda({ categoria: 'Inexistente' })]), /não cadastrada/);
  assert.equal(await contarVendas(), 0);
});

test('valor negativo, com três casas ou não numérico é rejeitado', async () => {
  for (const valor of [-1, 1.234, 'abc']) {
    await assert.rejects(importar([venda({ valor_vendido: valor })]));
  }
  assert.equal(await contarVendas(), 0);
  await importar([venda({ valor_vendido: 0 })]);
  assert.equal(await contarVendas(), 1);
});

test('data ausente usa o instante da importação', async () => {
  await importar([venda({ data_faturamento: undefined })]);
  const { rows } = await db.query('select data_faturamento from public.vendas');
  assert.ok(rows[0].data_faturamento instanceof Date);
});

test('campanha inválida ou ausente impede a importação', async () => {
  await assert.rejects(importar([venda({ campanha_id: '00000000-0000-0000-0000-000000000000' })]), /campanha válida/);
  await assert.rejects(importar([venda({ campanha_id: undefined })]), /campanha válida/);
  assert.equal(await contarVendas(), 0);
});

test('ranking ordena por valor, distribui prêmios e zera a quarta posição', async () => {
  await importar([
    venda({ vendedor: 'joao.silva', valor_vendido: 4000 }),
    venda({ vendedor: 'maria.souza', valor_vendido: 3000 }),
    venda({ vendedor: 'pedro', valor_vendido: 2000 }),
    venda({ vendedor: 'carlos', valor_vendido: 1000 })
  ]);
  const r = await ranking();
  assert.ok(r.every((x) => x.categoria_nome === 'Tubos'));
  assert.deepEqual(r.map(x => x.posicao), [1, 2, 3, 4]);
  assert.deepEqual(r.map(x => Number(x.valor_premio)), [2000, 1500, 500, 0]);
  assert.deepEqual(r.map(x => x.vendedor_nome), ['João Silva', 'Maria Souza', 'Pedro', 'Carlos']);
});

test('empate compartilha a posição e deixa o prêmio pendente', async () => {
  await importar([
    venda({ vendedor: 'joao.silva', valor_vendido: 1000 }),
    venda({ vendedor: 'maria.souza', valor_vendido: 1000 }),
    venda({ vendedor: 'pedro', valor_vendido: 500 })
  ]);
  const r = await ranking();
  assert.deepEqual(r.map(x => x.posicao), [1, 1, 3]);
  assert.equal(r[0].valor_premio, null);
  assert.equal(r[0].status_empate, 'EMPATE - AGUARDANDO DECISÃO DA DIRETORIA');
  assert.equal(Number(r[2].valor_premio), 500);
});

test('vendedor sem venda não aparece no ranking', async () => {
  await importar([venda()]);
  assert.equal((await ranking()).length, 1);
});

test('resumo inclui vendedores zerados, excluídos com histórico e ordena por nome', async () => {
  await importar([venda({ valor_vendido: 1000 }), venda({ vendedor: 'maria.souza', valor_vendido: 2000 })]);
  const r = await resumo();
  const joaoRow = r.find(x => x.username === 'joao.silva');
  assert.deepEqual([Number(joaoRow.total_vendido), Number(joaoRow.itens), joaoRow.ultima_venda], [1000, 1, '2026-11-10']);
  assert.equal(joaoRow.excluido, false);
  const zerados = r.filter(x => x.username === 'pedro' || x.username === 'carlos');
  assert.ok(zerados.every(x => Number(x.total_vendido) === 0 && Number(x.itens) === 0 && x.ultima_venda === ''));
  assert.deepEqual(r.map(x => x.nome), [...r.map(x => x.nome)].sort((a, b) => a.localeCompare(b, 'pt-BR')));
});

test('resumo marca vendedor excluído preservando o histórico', async () => {
  await criarVendedor('sair.teste', 'Sair Teste', '123123');
  await importar([venda({ vendedor: 'sair.teste' })]);
  const id = (await boot()).vendedores.find(v => v.username === 'sair.teste').id;
  await rpc('jj_excluir_vendedor', [admin, id]);
  const r = await resumo();
  const excluido = r.find(x => x.username === 'sair.teste');
  assert.equal(excluido.excluido, true);
  assert.equal(Number(excluido.itens), 1);
});

test('evolução acumula por dia a partir do início e filtra por vendedor', async () => {
  await importar([
    venda({ valor_vendido: 1000 }),
    venda({ valor_vendido: 500, data_faturamento: '2026-11-12T12:00:00-03:00' }),
    venda({ vendedor: 'maria.souza', valor_vendido: 2000 })
  ]);
  assert.deepEqual(await evolucao(), [
    { data: '2026-10-01', valor: 0, acumulado: 0 },
    { data: '2026-11-10', valor: 3000, acumulado: 3000 },
    { data: '2026-11-12', valor: 500, acumulado: 3500 }
  ]);
  assert.deepEqual(await evolucao(vendedores['joao.silva']), [
    { data: '2026-10-01', valor: 0, acumulado: 0 },
    { data: '2026-11-10', valor: 1000, acumulado: 1000 },
    { data: '2026-11-12', valor: 500, acumulado: 1500 }
  ]);
});

test('resumo e evolução são exclusivos da diretoria e campanha precisa existir', async () => {
  await assert.rejects(resumo(joao), /diretoria/);
  await assert.rejects(evolucao(null, joao), /diretoria/);
  await assert.rejects(rpc('jj_resumo_campanha', [admin, '00000000-0000-0000-0000-000000000000']), /Campanha não encontrada/);
});

test('bootstrap leve do admin devolve vendas vazias e o total; vendedor recebe zero', async () => {
  await importar([venda(), venda({ vendedor: 'maria.souza' })]);
  const adminData = await boot();
  assert.deepEqual(adminData.vendas, []);
  assert.equal(adminData.vendas_total, 2);
  assert.equal(adminData.versao_regras, 4);
  const joaoData = await boot(joao);
  assert.deepEqual(joaoData.vendas, []);
  assert.equal(joaoData.vendas_total, 0);
});

test('privacidade: vendedor vê só o próprio cadastro e a posição, sem valores', async () => {
  await importar([venda({ valor_vendido: 1000 }), venda({ vendedor: 'maria.souza', valor_vendido: 2000 })]);
  const data = await boot(joao);
  assert.equal(data.vendedores.length, 1);
  assert.equal(data.vendedores[0].id, vendedores['joao.silva']);
  assert.equal(data.rankings.length, 1);
  assert.equal(data.rankings[0].posicao, 2);
  assert.deepEqual(Object.keys(data.rankings[0]).sort(), ['campanha_id', 'categoria_nome', 'posicao', 'vendedor_id']);
  assert.ok(!JSON.stringify(data).includes('maria.souza'));
  assert.ok(!JSON.stringify(data).includes('senha'));
});

test('admin não recebe senhas no bootstrap', async () => {
  assert.ok(!JSON.stringify(await boot()).includes('senha'));
});

test('anon não lê nem escreve tabelas e não executa o ranking privado', async () => {
  for (const table of ['vendedores', 'vendas', 'campanhas', 'categorias', 'importacoes']) {
    await assert.rejects(anon(`select * from public.${table}`), /permission denied/);
    await assert.rejects(anon(`delete from public.${table}`), /permission denied/);
  }
  await assert.rejects(anon('select * from public.jj_calcular_ranking()'), /permission denied/);
  await assert.rejects(anon('select * from jj_private.sessoes'), /permission denied/);
});

test('vendedor não importa nem altera cadastro', async () => {
  await assert.rejects(importar([venda()], joao), /diretoria/);
  await assert.rejects(rpc('jj_salvar', [joao, 'categorias', JSON.stringify({ nome: 'X' })]), /diretoria/);
});

test('sessões armazenam só hash, expiram no logout e tokens aleatórios diferem', async () => {
  const first = (await rpc('jj_login', ['maria.souza', '222222'])).token;
  const second = (await rpc('jj_login', ['maria.souza', '222222'])).token;
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
  const { rows } = await db.query('select token_hash from jj_private.sessoes');
  assert.ok(rows.every(s => s.token_hash !== first));
  await rpc('jj_logout', [first]);
  await assert.rejects(boot(first), /Sessão expirada/);
  await assert.rejects(boot('token-inventado'), /Sessão expirada/);
});

test('senhas são bcrypt', async () => {
  const { rows } = await db.query("select senha from public.vendedores where username='maria.souza'");
  assert.match(rows[0].senha, /^\$2[aby]\$/);
});

test('salvar campanha valida período, prêmios e nome único', async () => {
  await assert.rejects(rpc('jj_salvar', [admin, 'campanhas', JSON.stringify({ nome: 'Ruim', data_inicio: '2026-12-31', data_fim: '2026-10-01' })]), /período/);
  await assert.rejects(rpc('jj_salvar', [admin, 'campanhas', JSON.stringify({ nome: 'Ruim', data_inicio: '2026-10-01', data_fim: '2026-12-31', premio_1: -1 })]), /Prêmios/);
  await assert.rejects(rpc('jj_salvar', [admin, 'campanhas', JSON.stringify({ nome: 'Verão 2026', data_inicio: '2026-10-01', data_fim: '2026-12-31' })]), /Já existe uma campanha/);
});

test('salvar categoria bloqueia nome repetido', async () => {
  await assert.rejects(rpc('jj_salvar', [admin, 'categorias', JSON.stringify({ nome: 'tubos' })]), /Já existe uma categoria/);
});

test('excluir vendedor remove acesso e sessão, preserva vendas e impede reativação', async () => {
  const user = await criarVendedor('excluir.teste', 'Exclusão', '123123');
  const sessao = (await rpc('jj_login', ['excluir.teste', '123123'])).token;
  await importar([venda({ vendedor: 'excluir.teste' })]);
  await assert.rejects(rpc('jj_excluir_vendedor', [joao, user.id]), /diretoria/);
  assert.deepEqual(await rpc('jj_excluir_vendedor', [admin, user.id]), { ok: true });
  assert.equal((await db.query('select vendedor_id from public.vendas')).rows[0].vendedor_id, user.id);
  await assert.rejects(boot(sessao), /Sessão expirada/);
  await assert.rejects(rpc('jj_salvar', [admin, 'vendedores', JSON.stringify({ ...user, ativo: true })]), /excluído/);
});

test('excluir campanha desassocia as vendas sem removê-las', async () => {
  const extra = (await rpc('jj_salvar', [admin, 'campanhas', JSON.stringify({ nome: 'Temporária', data_inicio: '2026-01-01', data_fim: '2026-01-31' })])).id;
  await importar([venda({ campanha_id: extra })]);
  assert.deepEqual(await rpc('jj_excluir_campanha', [admin, extra, true]), { ok: true });
  const { rows } = await db.query('select campanha_id from public.vendas');
  assert.equal(rows[0].campanha_id, null);
  assert.equal(await contarVendas(), 1);
});

test('excluir categoria remove do cadastro sem afetar vendas já registradas', async () => {
  await importar([venda({ categoria: 'Elétrica' })]);
  await assert.rejects(rpc('jj_excluir_categoria', [joao, categorias['Elétrica']]), /diretoria/);
  assert.deepEqual(await rpc('jj_excluir_categoria', [admin, categorias['Elétrica']]), { ok: true });
  assert.equal(await contarVendas(), 1);
  assert.ok(!(await boot()).categorias.some(c => c.id === categorias['Elétrica']));
});

test('importação limitada a 5.000 linhas', async () => {
  await assert.rejects(importar(Array.from({ length: 5001 }, () => venda())), /5.000/);
});

test('bootstrap devolve categorias ativas e campanhas cadastradas', async () => {
  const data = await boot();
  assert.ok(data.categorias.some(c => c.nome === 'Tubos'));
  assert.ok(data.campanhas.some(c => c.id === campanha));
});
