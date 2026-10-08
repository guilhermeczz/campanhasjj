// Generate the standalone upgrade from the canonical backend functions.
// Does not connect to any database. Run again when these functions change.
import { readFileSync, writeFileSync } from 'node:fs';
const backend = readFileSync('supabase/migration_backend_seguro.sql', 'utf8');
function definition(name) {
  const start = backend.indexOf(`create or replace function public.${name}(`);
  const end = backend.indexOf('end $$;', start);
  if (start < 0 || end < start) throw new Error(`Missing function ${name}`);
  return backend.slice(start, end + 'end $$;'.length);
}
const sql = `-- Exclusão de produtos: aplicar após o backend seguro. Pode ser reaplicada.
-- Preserva vendas, pontos, auditoria e a RPC pública de importação com auditoria.
-- Gerado por scripts/build-products-migration.mjs a partir do backend canônico.
begin;
alter table public.produtos add column if not exists excluido_em timestamptz;

${['jj_bootstrap', 'jj_resumo_campanha', 'jj_evolucao_campanha', 'jj_datas_itens', 'jj_salvar', 'jj_importar_produtos', 'jj_excluir_produto'].map(definition).join('\n\n')}

${definition('jj_importar').replace('public.jj_importar(', 'jj_private.importar_vendas(')}

-- Atualiza também o núcleo público em instalações que ainda não ativaram auditoria.
do $migration$
begin
  if to_regprocedure('public.jj_importar_com_auditoria(text,jsonb,text)') is null then
    execute replace(pg_get_functiondef('jj_private.importar_vendas(text,jsonb)'::regprocedure),
      'FUNCTION jj_private.importar_vendas(', 'FUNCTION public.jj_importar(');
  end if;
end $migration$;
revoke all on function jj_private.importar_vendas(text,jsonb) from public,anon,authenticated;
revoke all on function public.jj_bootstrap(text),public.jj_salvar(text,text,jsonb),public.jj_importar_produtos(text,jsonb),
  public.jj_excluir_produto(text,uuid,boolean),public.jj_importar(text,jsonb) from public,anon,authenticated;
revoke all on function public.jj_resumo_campanha(text,uuid),public.jj_evolucao_campanha(text,uuid,uuid),public.jj_datas_itens(text,jsonb) from public,anon,authenticated;
grant execute on function public.jj_bootstrap(text),public.jj_salvar(text,text,jsonb),public.jj_importar_produtos(text,jsonb),
  public.jj_excluir_produto(text,uuid,boolean),public.jj_importar(text,jsonb) to anon,authenticated;
grant execute on function public.jj_resumo_campanha(text,uuid),public.jj_evolucao_campanha(text,uuid,uuid),public.jj_datas_itens(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
`;
writeFileSync('supabase/migration_exclusao_produtos.sql', sql, 'utf8');
