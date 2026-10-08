import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
  .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]));
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
for (const table of ['vendedores', 'campanhas', 'marcas', 'produtos', 'vendas', 'campanha_marcas']) {
  const { error, count, status } = await client.from(table).select('*', { count: 'exact', head: true });
  console.log(`${table}: ${error ? `acesso indisponível (HTTP ${status}, ${error.code || 'sem corpo na resposta HEAD'})` : `${count} registros`}`);
}
for (const [nome, args] of [
  ['jj_bootstrap', {}],
  ['jj_resumo_campanha', { p_campanha_id: '00000000-0000-0000-0000-000000000000' }],
  ['jj_evolucao_campanha', { p_campanha_id: '00000000-0000-0000-0000-000000000000' }],
  ['jj_datas_itens', { p_ids: [] }],
  ['jj_importar_produtos', { p_linhas: [] }],
  ['jj_importar_com_auditoria', { p_linhas: [], p_arquivo: 'diagnostico.xlsx' }],
  ['jj_auditoria_listar', {}],
  ['jj_auditoria_detalhe', { p_id: '00000000-0000-0000-0000-000000000000' }],
  ['jj_auditoria_desfazer', { p_id: '00000000-0000-0000-0000-000000000000', p_confirmar: false }],
  ['jj_excluir_vendedor', { p_id: '00000000-0000-0000-0000-000000000000' }],
  ['jj_excluir_produto', { p_id: '00000000-0000-0000-0000-000000000000', p_confirmar: false }]
]) {
  // An invalid token is rejected before any mutation by these RPCs.
  const { error } = await client.rpc(nome, { p_token: 'invalid-session-read-only-check', ...args });
  const estado = error?.code === 'PGRST202' ? 'atualização do banco pendente' : error?.code === 'P0001' && /sessão inválida/i.test(error.message)
    ? 'disponível; sessão inválida rejeitada' : `verificar resposta (${error?.code || 'sem código'})`;
  console.log(`${nome}: ${estado}`);
}
