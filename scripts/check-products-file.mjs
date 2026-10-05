// Run npm test first, then node scripts/check-products-file.mjs <file.xlsx>.
// All writes go to an in-memory PostgreSQL instance, never the live Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const require = createRequire(import.meta.url);
const { lerProdutos } = require('../.test-build/lib/produtosExcel.js');
const { calcularPontosProduto } = require('../.test-build/lib/pontuacao.js');
const { acompanharCampanha, evolucaoCampanha } = require('../.test-build/lib/acompanhamento.js');
if (!process.argv[2]) throw new Error('Informe o caminho do arquivo .xlsx.');
const file = new File([await readFile(process.argv[2])], basename(process.argv[2]));
const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec('create role anon; create role authenticated; grant usage on schema public to anon, authenticated;');
  for (const name of ['schema.sql', 'migration_copa.sql', 'migration_campanhas_por_marca.sql', 'migration_backend_seguro.sql', 'migration_auditoria_importacoes.sql']) {
    await db.exec(await readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8'));
  }
  async function rpc(name, params) {
    await db.exec('set role anon');
    try { return (await db.query(`select public.${name}(${params.map((_,i) => `$${i+1}`).join(',')}) as result`, params)).rows[0].result; }
    finally { await db.exec('reset role'); }
  }
  const token = (await rpc('jj_login', ['admin', '123456'])).token;
  const initial = await rpc('jj_bootstrap', [token]);
  const marca = initial.marcas.find(m => m.nome.toUpperCase() === 'AMANCO') || await rpc('jj_salvar', [token, 'marcas', JSON.stringify({ nome: 'AMANCO', codigo_externo: 'TESTE-AMANCO' })]);
  const campanha = initial.campanhas.find(c => c.marca_id === marca.id) || await rpc('jj_salvar', [token, 'campanhas', JSON.stringify({ nome: 'Campanha de teste', marca_id: marca.id, data_inicio: '2026-10-01', data_fim: '2026-12-31' })]);
  const rows = await lerProdutos(file, [marca], [], marca.id);
  assert.equal(rows.filter(r => r.erro).length, 0, JSON.stringify(rows.filter(r => r.erro)));
  const data = rows.map(({ linha, acao, erro, ...r }) => r);
  assert.deepEqual(await rpc('jj_importar_produtos', [token, JSON.stringify(data)]), { inseridas: rows.length, atualizadas: 0, total: rows.length });
  assert.deepEqual(await rpc('jj_importar_produtos', [token, JSON.stringify(data)]), { inseridas: 0, atualizadas: rows.length, total: rows.length });
  const vendas = rows.map((r,i) => ({ item_id: `TESTE-${i}`, vendedor: 'joao.silva', produto: r.codigo_externo || r.nome, quantidade: 100, marca_id: marca.id, data_faturamento: '2026-10-04T12:00:00-03:00', valor_bruto: 120, valor_devolucao: 10, valor_cancelamento: 10, cliente_id: 'TESTE', status: 'faturado' }));
  await rpc('jj_importar', [token, JSON.stringify(vendas)]);
  const boot = await rpc('jj_bootstrap', [token]);
  for (let i = 0; i < rows.length; i++) {
    const venda = boot.vendas.find(v => v.item_id === `TESTE-${i}`);
    assert.equal(venda.pontos, calcularPontosProduto(100, rows[i]));
    assert.equal(venda.pontos, 100 * rows[i].pontos_por_real);
  }
  const equipe = acompanharCampanha(campanha, boot.vendas, boot.vendedores);
  const joao = boot.vendedores.find(v => v.username === 'joao.silva');
  const totalSQL = boot.pontuacoes.find(p => p.campanha_id === campanha.id && p.vendedor_id === joao.id).total_pontos;
  assert.equal(equipe.find(v => v.id === joao.id).pontos, totalSQL);
  assert.equal(evolucaoCampanha(campanha, boot.vendas, joao.id).at(-1).acumulado, totalSQL);
  assert.ok(equipe.filter(v => v.id !== joao.id).every(v => v.pontos === 0));
  await rpc('jj_importar', [token, JSON.stringify(vendas)]);
  const logs = await rpc('jj_auditoria_listar', [token]);
  assert.equal(logs.total, 2);
  assert.equal(logs.previas_unicas, 1);
  const ultimo = logs.registros.find(r => r.pode_desfazer);
  assert.equal(ultimo.total_pontos, totalSQL);
  await rpc('jj_auditoria_desfazer', [token, ultimo.id, true]);
  assert.deepEqual((await rpc('jj_bootstrap', [token])).vendas, boot.vendas);
  console.log(JSON.stringify({ arquivo: file.name, produtos: rows.length, erros: 0, cadastro: 'aprovado', reimportacao: 'sem duplicatas', calculos_validados: vendas.length, painel: 'total e evolução conferem com PostgreSQL; vendedores sem vendas zerados', auditoria: { registros: logs.total, previas_unicas: logs.previas_unicas, bytes_previas: logs.bytes_previas, bytes_reserva_desfazer: logs.bytes_restauracao, restauracao: 'valores preservados' }, fatores: [...new Set(rows.map(r => r.pontos_por_real))], banco: 'temporário em memória; Supabase real não alterado' }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.close(); }
