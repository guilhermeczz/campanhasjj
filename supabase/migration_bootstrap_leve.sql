-- Bootstrap leve + agregados por campanha. Aplicar DEPOIS de backend, auditoria e exclusao.
-- Pode ser reaplicado; preserva cadastros, vendas e auditoria.
-- O bootstrap deixa de devolver vendas (payload leve); o painel usa resumo/evolucao sob demanda.
begin;

create or replace function public.jj_bootstrap(p_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; resultado jsonb;
begin
  u:=jj_private.usuario(p_token);
  select jsonb_build_object(
    'versao_regras',3,
    'user',jsonb_build_object('id',u.id,'username',u.username,'nome',u.nome,'role',u.role),
    'campanhas',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('marca_nome',m.nome) order by c.nome),'[]'::jsonb)
      from public.campanhas c join public.marcas m on m.id=c.marca_id where c.tipo='faturamento_marca'),
    'marcas',(select coalesce(jsonb_agg(to_jsonb(m) order by m.nome),'[]'::jsonb) from public.marcas m),
    'produtos',(select coalesce(jsonb_agg(to_jsonb(p) order by p.nome),'[]'::jsonb) from public.produtos p where u.role='admin' and p.excluido_em is null),
    'vendedores',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'username',v.username,'nome',v.nome,'role',v.role,'ativo',v.ativo) order by v.nome),'[]'::jsonb)
      from public.vendedores v where v.excluido_em is null and (u.role='admin' or v.id=u.id)),
    -- Bootstrap leve: nenhuma venda é devolvida aqui, mesmo para admin.
    -- O painel usa jj_resumo_campanha/jj_evolucao_campanha por campanha (sob demanda, com cache).
    -- A prévia de reimportação usa jj_datas_itens somente com os itens do arquivo.
    'vendas','[]'::jsonb,
    'vendas_total',(select case when u.role='admin' then (select count(*) from public.vendas) else 0 end),
    'rankings',(select coalesce(jsonb_agg(case when u.role='admin'
        then to_jsonb(r)||jsonb_build_object('total_pontos',coalesce((
          select sum(v.pontos) from public.vendas v join public.campanhas c on c.id=r.campanha_id
          where v.vendedor_id=r.vendedor_id and v.marca_id=r.marca_id and v.status='faturado'
            and v.data_faturamento>=c.data_inicio::timestamp at time zone 'America/Sao_Paulo'
            and v.data_faturamento<(c.data_fim+1)::timestamp at time zone 'America/Sao_Paulo'
        ),0))
        else jsonb_build_object('campanha_id',r.campanha_id,'marca_id',r.marca_id,'marca_nome',r.marca_nome,'posicao',r.posicao)
      end order by r.campanha_id,r.posicao,r.vendedor_id),'[]'::jsonb)
      from public.jj_calcular_ranking() r where u.role='admin' or r.vendedor_id=u.id),
    'pontuacoes',(select case when u.role='admin' then (select coalesce(jsonb_agg(to_jsonb(p) order by p.campanha_id,p.vendedor_id),'[]'::jsonb) from (
      select c.id as campanha_id,v.vendedor_id,sum(v.pontos) as total_pontos
      from public.campanhas c join public.vendas v on v.marca_id=c.marca_id
        and v.data_faturamento>=c.data_inicio::timestamp at time zone 'America/Sao_Paulo'
        and v.data_faturamento<(c.data_fim+1)::timestamp at time zone 'America/Sao_Paulo'
      where c.tipo='faturamento_marca' and v.status='faturado'
      group by c.id,v.vendedor_id
    ) p) else '[]'::jsonb end)
  ) into resultado;
  return resultado;
end $$;

create or replace function public.jj_resumo_campanha(p_token text,p_campanha_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; camp public.campanhas;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode acompanhar resultados.'; end if;
  select * into camp from public.campanhas c where c.id=p_campanha_id and c.tipo='faturamento_marca';
  if camp.id is null then raise exception 'Campanha não encontrada.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.nome,x.id),'[]'::jsonb) from (
    select v.id, v.nome, v.username, v.ativo,
      (v.excluido_em is not null) as excluido,
      coalesce(a.pontos,0) as pontos, coalesce(a.liquido,0) as liquido,
      coalesce(a.itens,0) as itens, coalesce(a.ultima_venda,'') as "ultimaVenda"
    from public.vendedores v
    left join (
      select s.vendedor_id,
        round(sum(s.pontos),2) as pontos,
        round(sum(coalesce(s.valor_bruto,0)-coalesce(s.valor_devolucao,0)-coalesce(s.valor_cancelamento,0)),2) as liquido,
        count(*) as itens,
        max((s.data_faturamento at time zone 'America/Sao_Paulo'))::date::text as ultima_venda
      from public.vendas s
      where s.marca_id=camp.marca_id and s.status='faturado' and s.vendedor_id is not null
        and s.data_faturamento>=camp.data_inicio::timestamp at time zone 'America/Sao_Paulo'
        and s.data_faturamento<(camp.data_fim+1)::timestamp at time zone 'America/Sao_Paulo'
      group by s.vendedor_id
    ) a on a.vendedor_id=v.id
    where v.role='vendedor' and (v.excluido_em is null or a.vendedor_id is not null)
  ) x);
end $$;

create or replace function public.jj_evolucao_campanha(p_token text,p_campanha_id uuid,p_vendedor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; camp public.campanhas;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode acompanhar resultados.'; end if;
  select * into camp from public.campanhas c where c.id=p_campanha_id and c.tipo='faturamento_marca';
  if camp.id is null then raise exception 'Campanha não encontrada.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.data),'[]'::jsonb) from (
    with dias as (
      select (s.data_faturamento at time zone 'America/Sao_Paulo')::date as dia, sum(s.pontos) as pontos
      from public.vendas s
      where s.marca_id=camp.marca_id and s.status='faturado'
        and s.data_faturamento>=camp.data_inicio::timestamp at time zone 'America/Sao_Paulo'
        and s.data_faturamento<(camp.data_fim+1)::timestamp at time zone 'America/Sao_Paulo'
        and (p_vendedor_id is null or s.vendedor_id=p_vendedor_id)
      group by 1
    ), soma as (
      select dia, sum(pontos) as pontos from (
        select camp.data_inicio as dia, 0::numeric as pontos
        union all
        select d.dia, d.pontos from dias d
      ) t group by dia
    )
    select dia as data, round(pontos,2) as pontos, round(sum(pontos) over (order by dia),2) as acumulado from soma
  ) x);
end $$;

create or replace function public.jj_datas_itens(p_token text,p_ids jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode importar vendas.'; end if;
  if jsonb_typeof(p_ids) is distinct from 'array' then raise exception 'Informe os itens para consulta.'; end if;
  if jsonb_array_length(p_ids)>5000 then raise exception 'Consulte até 5.000 itens por vez.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('item_id',v.item_id,'data_faturamento',v.data_faturamento) order by v.item_id),'[]'::jsonb)
    from public.vendas v where v.item_id in (select x#>>'{}' from jsonb_array_elements(p_ids) x));
end $$;

revoke all on function public.jj_bootstrap(text) from public,anon,authenticated;
grant execute on function public.jj_bootstrap(text) to anon,authenticated;
revoke all on function public.jj_resumo_campanha(text,uuid),public.jj_evolucao_campanha(text,uuid,uuid),public.jj_datas_itens(text,jsonb) from public,anon,authenticated;
grant execute on function public.jj_resumo_campanha(text,uuid),public.jj_evolucao_campanha(text,uuid,uuid),public.jj_datas_itens(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
