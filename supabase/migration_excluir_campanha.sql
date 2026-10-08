-- Campanhas JJ: Exclusão de campanha
-- Exclui a campanha e remove a associação das vendas.
begin;

create or replace function public.jj_excluir_campanha(p_token text, p_id uuid, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode excluir campanhas.'; end if;
  if p_confirmar is distinct from true then raise exception 'Confirme a exclusão da campanha.'; end if;
  perform pg_advisory_xact_lock(7482027);
  update public.vendas set campanha_id=null, campanha='' where campanha_id=p_id;
  delete from public.campanhas where id=p_id;
  if not found then raise exception 'Campanha não encontrada.'; end if;
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.jj_excluir_campanha(text, uuid, boolean) to anon, authenticated;
commit;
