import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// PostgreSQL real compilado para WASM, com pgcrypto e os mesmos SQLs do Supabase.
// Cada RPC é executada como anon: SECURITY DEFINER/grants/RLS são exercitados.
const db = new PGlite({ extensions: { pgcrypto } });
const migrationPath = new URL('../supabase/migration_backend_seguro.sql', import.meta.url);
let adminToken, joaoToken, marcas, campanhas, vendedores, seq = 0;

async function anon(sql, params = []) {
  await db.exec('set role anon');
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}
async function rpc(name, args = []) {
  const { rows } = await anon(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args);
  return rows[0].result;
}
async function boot(token = adminToken) { return rpc('jj_bootstrap', [token]); }
async function importar(linhas, token = adminToken) { return rpc('jj_importar', [token, JSON.stringify(linhas)]); }
function venda(overrides = {}) {
  return { item_id: `NF-2026-${++seq}-1`, vendedor: 'joao.silva', produto: 'Conector 221',
    quantidade: 1, marca_id: marcas.WAGO, data_faturamento: '2026-11-10T12:00:00-03:00',
    valor_bruto: 1000, valor_devolucao: 0, valor_cancelamento: 0, cliente_id: 'CLIENTE-A', status: 'faturado', ...overrides };
}
async function ranking(marca = 'WAGO') {
  return (await boot()).rankings.filter(r => r.campanha_id === campanhas[marca]);
}

before(async () => {
  await db.exec('create role anon; create role authenticated; grant usage on schema public to anon, authenticated;');
  for (const file of ['schema.sql', 'migration_copa.sql', 'migration_campanhas_por_marca.sql', 'migration_backend_seguro.sql']) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8');
    try { await db.exec(sql); }
    catch (error) { throw new Error(`Falha na migration ${file}: ${error.message} (código ${error.code}, posição ${error.position})`); }
  }
  const login = await rpc('jj_login', ['admin', '123456']);
  assert.ok(login.token, JSON.stringify(login));
  adminToken = login.token;
  joaoToken = (await rpc('jj_login', ['joao.silva', '111111'])).token;
  await rpc('jj_salvar', [adminToken, 'vendedores', JSON.stringify({ username: 'pedro', nome: 'Pedro', senha: '333333', role: 'vendedor', ativo: true })]);
  await rpc('jj_salvar', [adminToken, 'vendedores', JSON.stringify({ username: 'carlos', nome: 'Carlos', senha: '444444', role: 'vendedor', ativo: true })]);
  const data = await boot();
  marcas = Object.fromEntries(data.marcas.map(m => [m.nome, m.id]));
  campanhas = Object.fromEntries(data.campanhas.map(c => [c.marca_nome, c.id]));
  vendedores = Object.fromEntries(data.vendedores.map(v => [v.username, v.id]));
  for (const marca_id of Object.values(marcas)) {
    await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Conector 221', marca_id, valor_por_ponto: 200, ativo: true })]);
  }
});
beforeEach(async () => { await db.exec('truncate public.vendas; truncate jj_private.tentativas_login;'); });
after(async () => { await db.close(); });

test('1. faturamento anterior a 01/10/2026 em São Paulo não participa', async () => {
  await importar([venda({ data_faturamento: '2026-10-01T02:59:59.999Z' })]);
  assert.equal((await ranking()).length, 0);
});
test('2. primeiro instante de 01/10/2026 em São Paulo participa', async () => {
  await importar([venda({ data_faturamento: '2026-10-01T03:00:00Z' })]);
  assert.equal((await ranking())[0].faturamento_liquido_marca, 1000);
});
test('3. último instante de 31/12/2026 participa, incluindo frações de segundo', async () => {
  await importar([venda({ data_faturamento: '2027-01-01T02:59:59.999999Z' })]);
  assert.equal((await ranking())[0].faturamento_liquido_marca, 1000);
});
test('4. faturamento em 01/01/2027 não participa', async () => {
  await importar([venda({ data_faturamento: '2027-01-01T03:00:00Z' })]);
  assert.equal((await ranking()).length, 0);
});
test('5. marca sem campanha não aparece na classificação', async () => {
  await importar([venda({ marca_id: marcas.Deca })]);
  assert.equal((await boot()).rankings.length, 0);
  assert.equal((await boot()).vendas.length, 1, 'preservar venda para o faturamento geral');
});
test('6. venda integralmente cancelada não soma nem cria participante', async () => {
  await importar([venda({ status: 'cancelado', valor_bruto: 20000 })]);
  assert.equal((await ranking()).length, 0);
});
test('7. devolução parcial desconta somente seu valor e sua marca', async () => {
  await importar([venda({ valor_bruto: 20000, valor_devolucao: 2000 }), venda({ marca_id: marcas.Enerbras, valor_bruto: 900, valor_devolucao: 100 })]);
  const r = (await ranking())[0];
  assert.equal(r.faturamento_bruto_marca, 20000);
  assert.equal(r.valor_devolucoes_marca, 2000);
  assert.equal(r.faturamento_liquido_marca, 18000);
  assert.equal((await ranking('Enerbras'))[0].faturamento_liquido_marca, 800);
});
test('8. vários pedidos do mesmo cliente contam apenas uma pessoa', async () => {
  await importar(['A', 'A', 'A', 'B', 'C'].map(cliente_id => venda({ cliente_id })));
  assert.equal((await ranking())[0].quantidade_clientes_distintos, 3);
});
test('9. faturamento igual desempata pela maior quantidade de clientes', async () => {
  await importar([venda({ valor_bruto: 500, cliente_id: 'A' }), venda({ valor_bruto: 500, cliente_id: 'B' }), venda({ vendedor: 'maria.souza', valor_bruto: 1000 })]);
  const r = await ranking();
  assert.equal(r[0].vendedor_id, vendedores['joao.silva']);
  assert.equal(r[0].quantidade_clientes_distintos, 2);
  assert.equal(r[0].status_empate, null);
});
test('10. faturamento e clientes iguais desempata pelo geral, incluindo marcas sem campanha', async () => {
  await importar([venda(), venda({ vendedor: 'maria.souza' }), venda({ vendedor: 'maria.souza', marca_id: marcas.Deca, valor_bruto: 500 }), venda({ marca_id: marcas.Enerbras, valor_bruto: 100 })]);
  const r = await ranking();
  assert.equal(r[0].vendedor_id, vendedores['maria.souza']);
  assert.equal(r[0].faturamento_liquido_marca, 1000);
  assert.equal(r[0].faturamento_geral_periodo, 1500);
  assert.equal(r[1].faturamento_geral_periodo, 1100);
});
test('11. empate total compartilha posição e deixa prêmio pendente', async () => {
  await importar([venda(), venda({ vendedor: 'maria.souza' }), venda({ vendedor: 'pedro', valor_bruto: 900 })]);
  const r = await ranking();
  assert.deepEqual(r.map(x => x.posicao), [1, 1, 3]);
  for (const x of r.slice(0, 2)) {
    assert.equal(x.status_empate, 'EMPATE - AGUARDANDO DECISÃO DA DIRETORIA');
    assert.equal(x.valor_premio, null);
  }
  assert.equal(r[2].valor_premio, 500);
});
test('12. mesmo vendedor pode participar do TOP 3 em várias marcas', async () => {
  await importar([venda(), venda({ marca_id: marcas.Enerbras })]);
  const rows = (await boot()).rankings;
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.vendedor_id === vendedores['joao.silva'] && r.posicao === 1));
});
test('13. vendedor sem venda na marca não aparece', async () => {
  await importar([venda()]);
  assert.equal((await ranking()).length, 1);
  assert.equal((await ranking('Enerbras')).length, 0);
});
test('prêmios TOP 3 e quarta posição são associados à classificação', async () => {
  await importar(['joao.silva', 'maria.souza', 'pedro', 'carlos'].map((vendedor, i) => venda({ vendedor, valor_bruto: 1000 - i * 100 })));
  assert.deepEqual((await ranking()).map(x => x.valor_premio), [2000, 1500, 500, 0]);
});
test('empate entre terceiro e quarto não escolhe vencedor por ID', async () => {
  await importar(['joao.silva', 'maria.souza', 'pedro', 'carlos'].map((vendedor, i) => venda({ vendedor, valor_bruto: [3000, 2000, 1000, 1000][i] })));
  const r = await ranking();
  assert.deepEqual(r.map(x => x.posicao), [1, 2, 3, 3]);
  assert.deepEqual(r.map(x => x.valor_premio), [2000, 1500, null, null]);
});
test('cancelamentos ficam auditáveis mas não acrescentam clientes ou líquido', async () => {
  await importar([venda(), venda({ status: 'cancelado', valor_bruto: 500, valor_devolucao: 100, cliente_id: 'CANCELADO' }), venda({ valor_bruto: 200, valor_cancelamento: 50 })]);
  const r = (await ranking())[0];
  assert.equal(r.faturamento_bruto_marca, 1700);
  assert.equal(r.valor_devolucoes_marca, 100);
  assert.equal(r.valor_cancelamentos_marca, 450);
  assert.equal(r.faturamento_liquido_marca, 1150);
  assert.equal(r.quantidade_clientes_distintos, 1);
});
test('cliente de venda zero, totalmente devolvida ou cancelada não desempata', async () => {
  await importar([venda(), venda({ valor_bruto: 100, valor_devolucao: 100, cliente_id: 'DEVOLVIDO' }), venda({ valor_bruto: 0, cliente_id: 'ZERO' }), venda({ valor_bruto: 100, valor_cancelamento: 100, cliente_id: 'CANCELADO' })]);
  assert.equal((await ranking())[0].quantidade_clientes_distintos, 1);
});
test('geral respeita período e descontos de outras marcas', async () => {
  await importar([venda(), venda({ marca_id: marcas.Deca, valor_bruto: 500, valor_devolucao: 200, valor_cancelamento: 100 }), venda({ marca_id: marcas.Enerbras, valor_bruto: 100000, data_faturamento: '2027-01-01T03:00:00Z' })]);
  assert.equal((await ranking())[0].faturamento_geral_periodo, 1200);
});
test('o fuso da sessão PostgreSQL não altera os limites da campanha', async () => {
  await db.exec("set timezone='Asia/Tokyo'");
  try {
    await importar([venda({ data_faturamento: '2026-10-01T02:59:59Z' }), venda({ data_faturamento: '2026-10-01T03:00:00Z' })]);
    assert.equal((await ranking())[0].faturamento_liquido_marca, 1000);
  } finally { await db.exec("set timezone='UTC'"); }
});
test('reimportação atualiza o mesmo item sem duplicar seu faturamento', async () => {
  const item = venda({ item_id: 'MESMA-NOTA-ITEM-1' });
  assert.deepEqual(await importar([item]), { inseridas: 1, atualizadas: 0, total: 1 });
  assert.deepEqual(await importar([{ ...item, valor_devolucao: 300 }]), { inseridas: 0, atualizadas: 1, total: 1 });
  assert.equal((await boot()).vendas.length, 1);
  assert.equal((await ranking())[0].faturamento_liquido_marca, 700);
});
test('uma linha inválida desfaz a importação inteira', async () => {
  await assert.rejects(importar([venda(), venda({ vendedor: 'nao-existe' })]), /vendedor não cadastrado/);
  assert.equal((await boot()).vendas.length, 0);
});
test('IDs duplicados no mesmo arquivo são rejeitados antes de escrever', async () => {
  await assert.rejects(importar([venda({ item_id: 'DUP' }), venda({ item_id: 'DUP' })]), /item_id repetido/);
  assert.equal((await boot()).vendas.length, 0);
});
test('servidor valida cliente, marca, data, valores e status', async () => {
  for (const invalid of [
    { cliente_id: '' }, { marca_id: 'WAGO' }, { valor_bruto: -1 }, { valor_devolucao: 1001 },
    { valor_bruto: 'NaN' }, { valor_bruto: 1.234 }, { quantidade: 0 }, { status: 'orcamento' },
    { data_faturamento: '2026-11-01T12:00:00' }, { data_faturamento: '2026-02-30T12:00:00-03:00' }
  ]) await assert.rejects(importar([venda(invalid)]));
  assert.equal((await boot()).vendas.length, 0);
});
test('marca e data determinam campanha; campo campanha do cliente é ignorado', async () => {
  await importar([venda({ campanha: 'Enerbras', campanha_id: campanhas.Enerbras })]);
  const data = await boot();
  assert.equal(data.vendas[0].campanha_id, campanhas.WAGO);
  assert.equal(data.rankings[0].campanha_id, campanhas.WAGO);
});
test('dados legados não faturados são excluídos mesmo contendo data', async () => {
  await importar([venda({ item_id: 'LEGADO' })]);
  await db.exec("update public.vendas set status='orcamento' where item_id='LEGADO'");
  assert.equal((await ranking()).length, 0);
});
test('bootstrap do vendedor entrega apenas seu cadastro, vendas e posições reais', async () => {
  await importar([venda(), venda({ vendedor: 'maria.souza', valor_bruto: 2000 })]);
  const data = await boot(joaoToken);
  assert.equal(data.vendedores.length, 1);
  assert.equal(data.vendedores[0].id, vendedores['joao.silva']);
  assert.equal(data.vendas.length, 1);
  assert.equal(data.rankings.length, 1);
  assert.equal(data.rankings[0].posicao, 2, 'ranking deve ser calculado antes do filtro de privacidade');
  assert.ok(data.rankings.every(r => r.vendedor_id === vendedores['joao.silva']));
  assert.ok(!JSON.stringify(data).includes('maria.souza'));
  assert.ok(!JSON.stringify(data).includes('senha'));
});
test('admin também não recebe senhas e só vê campanhas por marca', async () => {
  const data = await boot();
  assert.ok(data.campanhas.every(c => c.tipo === 'faturamento_marca' && c.marca_id));
  assert.ok(!JSON.stringify(data).includes('senha'));
});
test('anon não lê nem escreve tabelas e não executa o ranking privado', async () => {
  for (const table of ['vendedores', 'vendas', 'campanhas', 'marcas', 'produtos', 'campanha_marcas']) {
    await assert.rejects(anon(`select * from public.${table}`), /permission denied/);
    await assert.rejects(anon(`delete from public.${table}`), /permission denied/);
  }
  await assert.rejects(anon('select * from public.jj_calcular_ranking()'), /permission denied/);
  await assert.rejects(anon('select * from jj_private.sessoes'), /permission denied/);
});
test('vendedor não importa nem altera cadastro enviando role adulterada', async () => {
  await assert.rejects(importar([venda()], joaoToken), /diretoria/);
  await assert.rejects(rpc('jj_salvar', [joaoToken, 'vendedores', JSON.stringify({ id: vendedores['joao.silva'], nome: 'João', role: 'admin' })]), /diretoria/);
});
test('sessões aleatórias expiram, são revogadas no logout e armazenam só hash', async () => {
  const first = await rpc('jj_login', ['maria.souza', '222222']);
  const second = await rpc('jj_login', ['maria.souza', '222222']);
  assert.match(first.token, /^[0-9a-f]{64}$/);
  assert.notEqual(first.token, second.token);
  const { rows } = await db.query('select token_hash from jj_private.sessoes');
  assert.ok(rows.every(s => s.token_hash !== first.token));
  await rpc('jj_logout', [first.token]);
  await assert.rejects(boot(first.token), /Sessão expirada/);
  await db.query("update jj_private.sessoes set expira_em=now()-interval '1 second' where vendedor_id=$1", [vendedores['maria.souza']]);
  await assert.rejects(boot(second.token), /Sessão expirada/);
  await assert.rejects(boot('token-inventado'), /Sessão inválida/);
});
test('senhas são bcrypt e limite de cinco tentativas persiste entre RPCs', async () => {
  const { rows } = await db.query("select senha from public.vendedores where username='maria.souza'");
  assert.match(rows[0].senha, /^\$2[aby]\$/);
  for (let i = 0; i < 5; i++) assert.ok((await rpc('jj_login', ['maria.souza', '000000'])).error);
  assert.match((await rpc('jj_login', ['maria.souza', '222222'])).error, /Muitas tentativas/);
  await db.exec("update jj_private.tentativas_login set janela_inicio=now()-interval '16 minutes'");
  assert.ok((await rpc('jj_login', ['maria.souza', '222222'])).token);
});
test('cadastro salva marca por ID e bloqueia campanhas sobrepostas', async () => {
  const marca = await rpc('jj_salvar', [adminToken, 'marcas', JSON.stringify({ nome: 'Marca de teste', codigo_externo: 'ERP-123', ativa: true })]);
  const c = await rpc('jj_salvar', [adminToken, 'campanhas', JSON.stringify({ nome: 'Campanha teste', marca_id: marca.id, data_inicio: '2026-10-01', data_fim: '2026-12-31' })]);
  assert.equal(c.marca_id, marca.id);
  await assert.rejects(rpc('jj_salvar', [adminToken, 'campanhas', JSON.stringify({ nome: 'Campanha duplicada', marca_id: marca.id, data_inicio: '2026-12-31', data_fim: '2027-01-31' })]), /já tem uma campanha/);
  await rpc('jj_salvar', [adminToken, 'marcas', JSON.stringify({ ...marca, codigo_externo: 'ERP-NOVO' })]);
  assert.equal((await boot()).marcas.find(m => m.id === marca.id).codigo_externo, 'ERP-NOVO');
  await assert.rejects(rpc('jj_salvar', [adminToken, 'marcas', JSON.stringify({ nome: 'MARCA DE TESTE', codigo_externo: 'DIFERENTE' })]), /Já existe uma marca/);
  const produto = await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Produto de teste', marca_id: marca.id, codigo_externo: 'PROD-123', valor_por_ponto: 200 })]);
  assert.equal(produto.marca_id, marca.id);
  assert.equal(produto.nome, 'Produto de teste');
  const alterado = await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ ...produto, nome: 'Produto atualizado', ativo: false })]);
  assert.equal(alterado.nome, 'Produto atualizado');
  assert.equal(alterado.ativo, false);
});
test('username é imutável e campos não autorizados não mudam senha/cadastro', async () => {
  const joao = (await boot()).vendedores.find(v => v.id === vendedores['joao.silva']);
  await assert.rejects(rpc('jj_salvar', [adminToken, 'vendedores', JSON.stringify({ ...joao, username: 'outro.usuario' })]), /não pode ser alterado/);
  await rpc('jj_salvar', [adminToken, 'vendedores', JSON.stringify({ ...joao, token: 'forjado', created_at: '1900-01-01' })]);
  assert.equal((await boot()).vendedores.find(v => v.id === joao.id).username, 'joao.silva');
});
test('sem truncamento REST: bootstrap devolve mais de 1000 itens', async () => {
  await importar(Array.from({ length: 1005 }, () => venda({ valor_bruto: 1 })));
  assert.equal((await boot()).vendas.length, 1005);
  assert.equal((await ranking())[0].faturamento_liquido_marca, 1005);
});
test('reaplicar migration preserva hashes, sessões e dados', async () => {
  await importar([venda()]);
  const oldHash = (await db.query("select senha from public.vendedores where username='admin'")).rows[0].senha;
  await db.exec(await readFile(migrationPath, 'utf8'));
  assert.equal((await db.query("select senha from public.vendedores where username='admin'")).rows[0].senha, oldHash);
  assert.equal((await boot()).vendas.length, 1);
  assert.equal((await ranking())[0].faturamento_liquido_marca, 1000);
});

test('pontos usam valor líquido e regra do produto, ignorando pontos adulterados pelo navegador', async () => {
  await importar([venda({ quantidade: 99, valor_bruto: 700, valor_devolucao: 50, valor_cancelamento: 50, pontos: 999999, valor_por_ponto: 1 })]);
  const data = await boot();
  assert.equal(data.vendas[0].pontos, 3);
  assert.equal(data.vendas[0].valor_por_ponto, 200);
  assert.equal(data.rankings[0].total_pontos, 3);
  assert.equal(data.pontuacoes[0].total_pontos, 3);
});

test('pontos proporcionais são calculados com duas casas decimais por item', async () => {
  await importar([venda({ valor_bruto: 300 }), venda({ valor_bruto: 123.45 }), venda({ valor_bruto: 201 })]);
  const data = await boot();
  assert.deepEqual(data.vendas.map((v) => v.pontos).sort((a,b) => a-b), [0.62, 1.01, 1.5]);
  assert.equal(data.pontuacoes[0].total_pontos, 3.13);
});

test('cada produto usa sua própria regra dentro da marca e vendedor vê apenas seus pontos', async () => {
  await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Produto de 100 reais', marca_id: marcas.WAGO, valor_por_ponto: 100 })]);
  await importar([venda({ valor_bruto: 600 }), venda({ produto: 'Produto de 100 reais', valor_bruto: 300 }), venda({ vendedor: 'maria.souza', valor_bruto: 2000 })]);
  const admin = await boot();
  assert.equal(admin.rankings[0].vendedor_id, vendedores['maria.souza']);
  const joao = await boot(joaoToken);
  assert.equal(joao.pontuacoes.length, 1);
  assert.equal(joao.pontuacoes[0].total_pontos, 6);
  assert.equal(joao.rankings[0].posicao, 2);
  assert.equal(joao.rankings[0].total_pontos, 6);
  assert.ok(joao.pontuacoes.every((p) => p.vendedor_id === vendedores['joao.silva']));
  assert.equal(joao.produtos.length, 0);
  assert.ok(!JSON.stringify(joao).includes('maria.souza'));
});

test('pendentes e cancelados têm zero pontos, devoluções parciais reduzem a base', async () => {
  await importar([venda({ valor_bruto: 600, valor_devolucao: 200 }), venda({ valor_bruto: 1000, status: 'cancelado' }), venda({ valor_bruto: 1000, status: 'pendente' })]);
  const data = await boot();
  assert.equal(data.pontuacoes[0].total_pontos, 2);
  assert.equal(data.rankings[0].faturamento_liquido_marca, 400);
  assert.ok(data.vendas.filter((v) => v.status !== 'faturado').every((v) => v.pontos === 0));
});

test('alterar valor por ponto recalcula lançamentos e reimportar não duplica pontos', async () => {
  const product = await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Produto editável', marca_id: marcas.WAGO, valor_por_ponto: 200 })]);
  const item = venda({ produto: product.nome, valor_bruto: 600, item_id: 'REGRA-EDITAVEL' });
  await importar([item]);
  assert.equal((await boot()).vendas[0].pontos, 3);
  await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ ...product, valor_por_ponto: 100 })]);
  assert.equal((await boot()).vendas[0].pontos, 6);
  await importar([item]);
  const data = await boot();
  assert.equal(data.vendas.length, 1);
  assert.equal(data.pontuacoes[0].total_pontos, 6);
  assert.equal(data.rankings[0].faturamento_liquido_marca, 600);
});

test('produto desconhecido, inativo ou sem regra válida bloqueia a venda', async () => {
  await assert.rejects(importar([venda({ produto: 'Desconhecido' })]), /produto não cadastrado/);
  await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Produto inativo', marca_id: marcas.WAGO, valor_por_ponto: 200, ativo: false })]);
  await assert.rejects(importar([venda({ produto: 'Produto inativo' })]), /produto inativo/);
  for (const valor_por_ponto of [0, -1, 1.234, 'NaN', null]) await assert.rejects(rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Inválido', marca_id: marcas.WAGO, valor_por_ponto })]));
});

test('importação de produtos cadastra, atualiza e é atômica', async () => {
  const linhas = [{ nome: 'Produto de lote', marca_id: marcas.WAGO, valor_por_ponto: 200 }];
  assert.deepEqual(await rpc('jj_importar_produtos', [adminToken, JSON.stringify(linhas)]), { inseridas: 1, atualizadas: 0, total: 1 });
  assert.deepEqual(await rpc('jj_importar_produtos', [adminToken, JSON.stringify([{ ...linhas[0], valor_por_ponto: 300 }])]), { inseridas: 0, atualizadas: 1, total: 1 });
  assert.equal((await boot()).produtos.find((p) => p.nome === 'Produto de lote').valor_por_ponto, 300);
  await assert.rejects(rpc('jj_importar_produtos', [adminToken, JSON.stringify([{ ...linhas[0], nome: 'Lote desfeito' }, { ...linhas[0], nome: 'Lote inválido', valor_por_ponto: 0 }])]));
  assert.ok(!(await boot()).produtos.some((p) => p.nome === 'Lote desfeito'));
  await assert.rejects(rpc('jj_importar_produtos', [adminToken, JSON.stringify([linhas[0], linhas[0]])]), /repetidos/);
  await assert.rejects(rpc('jj_importar_produtos', [joaoToken, JSON.stringify(linhas)]), /diretoria/);
});

test('excluir vendedor remove acesso e sessões, preserva vendas e impede reativação', async () => {
  const user = await rpc('jj_salvar', [adminToken, 'vendedores', JSON.stringify({ username: 'excluir.teste', nome: 'Exclusão teste', senha: '123123', role: 'vendedor' })]);
  const sessao = (await rpc('jj_login', ['excluir.teste', '123123'])).token;
  await importar([venda({ vendedor: 'excluir.teste' })]);
  await assert.rejects(rpc('jj_excluir_vendedor', [joaoToken, user.id]), /diretoria/);
  await assert.rejects(rpc('jj_excluir_vendedor', [adminToken, vendedores.admin]), /diretoria/);
  assert.deepEqual(await rpc('jj_excluir_vendedor', [adminToken, user.id]), { ok: true });
  const data = await boot();
  assert.ok(!data.vendedores.some((v) => v.id === user.id));
  assert.equal(data.vendas[0].vendedor_id, user.id);
  await assert.rejects(boot(sessao), /Sessão expirada/);
  assert.ok((await rpc('jj_login', ['excluir.teste', '123123'])).error);
  await assert.rejects(rpc('jj_salvar', [adminToken, 'vendedores', JSON.stringify({ ...user, ativo: true })]), /excluído/);
  await assert.rejects(importar([venda({ vendedor: 'excluir.teste' })]), /não cadastrado/);
});

test('excluir produto remove do catálogo, preserva vendas e libera recadastro', async () => {
  const produto = await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Produto excluível', codigo_externo: 'EXC-001', marca_id: marcas.WAGO, preco_venda: 10, pontos_por_real: 2 })]);
  await importar([venda({ produto: 'EXC-001', valor_bruto: 100 })]);
  assert.equal((await boot()).vendas[0].pontos, 200);
  await assert.rejects(rpc('jj_excluir_produto', [joaoToken, produto.id, true]), /diretoria/);
  await assert.rejects(rpc('jj_excluir_produto', [adminToken, produto.id, false]), /Confirme/);
  assert.deepEqual(await rpc('jj_excluir_produto', [adminToken, produto.id, true]), { ok: true });
  await assert.rejects(rpc('jj_excluir_produto', [adminToken, produto.id, true]), /não encontrado ou já excluído/);
  const data = await boot();
  assert.ok(!data.produtos.some((p) => p.id === produto.id));
  assert.equal(data.vendas[0].produto_id, produto.id);
  assert.equal(data.vendas[0].pontos, 200);
  await assert.rejects(importar([venda({ produto: 'EXC-001', valor_bruto: 50 })]), /produto não cadastrado/);
  await assert.rejects(rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ ...produto, nome: 'Tentativa' })]), /excluído/);
  const novo = await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Produto excluível', codigo_externo: 'EXC-001', marca_id: marcas.WAGO, preco_venda: 10, pontos_por_real: 1 })]);
  assert.notEqual(novo.id, produto.id);
  await importar([venda({ produto: 'EXC-001', valor_bruto: 100, item_id: 'NF-2026-EXC-2' })]);
  assert.equal((await boot()).vendas.find((v) => v.item_id === 'NF-2026-EXC-2').pontos, 100);
});

test('pontos por real multiplicam o líquido: R$100 x 1 = 100 e x 1,5 = 150', async () => {
  const p = await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ nome: 'Multiplicador', codigo_externo: '0002', marca_id: marcas.WAGO, preco_venda: 6.99, pontos_por_real: 1.5 })]);
  await importar([venda({ produto: '0002', quantidade: 999, valor_bruto: 120, valor_devolucao: 10, valor_cancelamento: 10, pontos: 9999, pontos_por_real: 999 })]);
  let data = await boot();
  assert.equal(data.vendas[0].pontos, 150);
  assert.equal(data.vendas[0].produto, p.nome);
  assert.equal(data.vendas[0].pontos_por_real, 1.5);
  assert.equal(data.rankings[0].faturamento_liquido_marca, 100);
  await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ ...p, preco_venda: 999 })]);
  assert.equal((await boot()).vendas[0].pontos, 150, 'preço do catálogo não divide pontos');
  await rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ ...p, pontos_por_real: 1 })]);
  data = await boot();
  assert.equal(data.vendas[0].pontos, 100);
  assert.equal(data.rankings[0].faturamento_liquido_marca, 100);
  assert.equal(data.versao_regras, 3);
});

test('importação por código preserva produto e atualiza nome e fator sem duplicar', async () => {
  const linha = { nome: 'Catálogo original', codigo_externo: '0003', marca_id: marcas.WAGO, preco_venda: 6.99, pontos_por_real: 1.5 };
  assert.deepEqual(await rpc('jj_importar_produtos', [adminToken, JSON.stringify([linha])]), { inseridas: 1, atualizadas: 0, total: 1 });
  const p = (await boot()).produtos.find(p => p.codigo_externo === '0003');
  await importar([venda({ produto: '0003', valor_bruto: 6.99, quantidade: 500 })]);
  assert.equal((await boot()).vendas[0].pontos, 10.49);
  assert.deepEqual(await rpc('jj_importar_produtos', [adminToken, JSON.stringify([{ ...linha, nome: 'Catálogo renomeado', pontos_por_real: 2 }])]), { inseridas: 0, atualizadas: 1, total: 1 });
  let data = await boot();
  assert.equal(data.produtos.find(p => p.codigo_externo === '0003').id, p.id);
  assert.equal(data.vendas[0].pontos, 13.98);
  await db.exec(await readFile(migrationPath, 'utf8'));
  data = await boot();
  assert.equal(data.produtos.find(p => p.codigo_externo === '0003').pontos_por_real, 2);
  assert.equal(data.vendas[0].pontos, 13.98);
});

test('fatores inválidos, código duplicado e conflito de identificação revertem o lote', async () => {
  const base = { nome: 'Base código', codigo_externo: 'CONFLITO-A', marca_id: marcas.WAGO, preco_venda: 10, pontos_por_real: 1.5 };
  await rpc('jj_importar_produtos', [adminToken, JSON.stringify([base, { ...base, nome: 'Outro código', codigo_externo: 'CONFLITO-B' }])]);
  for (const pontos_por_real of [0, -1, null, 'NaN', 1.234]) await assert.rejects(rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ ...base, pontos_por_real })]));
  await assert.rejects(rpc('jj_importar_produtos', [adminToken, JSON.stringify([base, { ...base, nome: 'Repetido' }])]), /repetidos/);
  await assert.rejects(rpc('jj_importar_produtos', [adminToken, JSON.stringify([{ ...base, codigo_externo: 'CONFLITO-B' }])]), /duplicados/);
  await assert.rejects(rpc('jj_importar_produtos', [adminToken, JSON.stringify([{ ...base, nome: 'Reverter novo', codigo_externo: 'NOVO-ROLLBACK' }, { ...base, pontos_por_real: 0 }])]));
  assert.ok(!(await boot()).produtos.some(p => p.codigo_externo === 'NOVO-ROLLBACK'));
  await assert.rejects(rpc('jj_salvar', [adminToken, 'produtos', JSON.stringify({ ...base, nome: 'Duplicado' })]), /código/);
});
