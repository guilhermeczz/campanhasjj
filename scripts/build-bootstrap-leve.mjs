// Gera supabase/migration_bootstrap_leve.sql a partir do backend canônico.
// Não conecta em banco. Rode de novo quando jj_bootstrap/jj_resumo_campanha/
// jj_evolucao_campanha/jj_datas_itens mudarem (mesmo esquema do build-products-migration).
import { readFileSync, writeFileSync } from 'node:fs';
const backend = readFileSync('supabase/migration_backend_seguro.sql', 'utf8');
function definition(name) {
  const start = backend.indexOf(`create or replace function public.${name}(`);
  const end = backend.indexOf('end $$;', start);
  if (start < 0 || end < start) throw new Error(`Missing function ${name}`);
  return backend.slice(start, end + 'end $$;'.length);
}
const sql = `-- Bootstrap leve + agregados por campanha. Aplicar DEPOIS de backend, auditoria e exclusao.
-- Pode ser reaplicado; preserva cadastros, vendas e auditoria.
-- O bootstrap deixa de devolver vendas (payload leve); o painel usa resumo/evolucao sob demanda.
begin;

${['jj_bootstrap', 'jj_resumo_campanha', 'jj_evolucao_campanha', 'jj_datas_itens'].map(definition).join('\n\n')}

revoke all on function public.jj_bootstrap(text) from public,anon,authenticated;
grant execute on function public.jj_bootstrap(text) to anon,authenticated;
revoke all on function public.jj_resumo_campanha(text,uuid),public.jj_evolucao_campanha(text,uuid,uuid),public.jj_datas_itens(text,jsonb) from public,anon,authenticated;
grant execute on function public.jj_resumo_campanha(text,uuid),public.jj_evolucao_campanha(text,uuid,uuid),public.jj_datas_itens(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
`;
writeFileSync('supabase/migration_bootstrap_leve.sql', sql, 'utf8');
console.log(`migration_bootstrap_leve.sql gravada (${sql.length} bytes)`);
