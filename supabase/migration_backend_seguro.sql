-- Campanhas JJ: backend seguro, importação idempotente e ranking por marca.
-- Aplicar APÓS migration_campanhas_por_marca.sql no SQL Editor.
-- Pode ser reaplicado. Mantém os cadastros, vendas e senhas atuais (agora com hash).
-- A aplicação deve usar exclusivamente as RPCs jj_* públicas ao final deste arquivo.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists jj_private;
revoke all on schema jj_private from public, anon, authenticated;

-- A extensão pode já existir em public ou extensions no projeto Supabase.
-- O namespace vem do catálogo, nunca de um argumento fornecido pelo cliente.
create or replace function jj_private.senha_hash(p_senha text, p_hash text default null)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare ns text; resultado text;
begin
  select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if p_hash is null then
    execute format('select %I.crypt($1, %I.gen_salt(''bf'', 10))', ns, ns) into resultado using p_senha;
  else
    execute format('select %I.crypt($1, $2)', ns) into resultado using p_senha, p_hash;
  end if;
  return resultado;
end $$;

create or replace function jj_private.novo_token()
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare ns text; resultado text;
begin
  select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  execute format('select encode(%I.gen_random_bytes(32), ''hex'')', ns) into resultado;
  return resultado;
end $$;

update public.vendedores set senha=jj_private.senha_hash(senha)
where senha !~ '^\$2[aby]\$[0-9]{2}\$';

create table if not exists jj_private.sessoes (
  token_hash text primary key,
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '12 hours'
);
create index if not exists jj_sessoes_vendedor_idx on jj_private.sessoes(vendedor_id);
create table if not exists jj_private.tentativas_login (
  username text primary key,
  tentativas integer not null default 0,
  janela_inicio timestamptz not null default now()
);
alter table jj_private.sessoes enable row level security;
alter table jj_private.tentativas_login enable row level security;

alter table public.vendas add column if not exists item_id text;
alter table public.vendas add column if not exists vendedor_id uuid references public.vendedores(id);
alter table public.vendas add column if not exists produto_id uuid references public.produtos(id);
alter table public.vendas add column if not exists campanha_id uuid references public.campanhas(id);
alter table public.produtos add column if not exists ativo boolean not null default true;
alter table public.produtos add column if not exists excluido_em timestamptz;
alter table public.vendedores add column if not exists excluido_em timestamptz;
alter table public.produtos add column if not exists valor_por_ponto numeric(12,2);
alter table public.produtos add column if not exists preco_venda numeric(12,2);
alter table public.produtos add column if not exists pontos_por_real numeric(12,2);
alter table public.vendas alter column pontos type numeric(18,2);
alter table public.vendas add column if not exists valor_por_ponto numeric(12,2);
alter table public.vendas add column if not exists preco_venda numeric(12,2);
alter table public.vendas add column if not exists pontos_por_real numeric(12,2);
create unique index if not exists jj_vendas_item_id_unique on public.vendas(item_id);
create index if not exists jj_vendas_vendedor_periodo_idx on public.vendas(vendedor_id, data_faturamento);

-- Recupera apenas vínculos exatos e inequívocos. Não adivinha marca pelo produto.
update public.vendas v set vendedor_id=(
  select min(u.id::text)::uuid from public.vendedores u
  where lower(trim(u.username))=lower(trim(v.vendedor)) having count(*)=1
) where v.vendedor_id is null;
update public.vendas v set marca_id=(
  select min(m.id::text)::uuid from public.marcas m
  where lower(trim(v.marca_nome)) in (lower(trim(m.nome)), lower(trim(m.codigo_externo))) having count(*)=1
) where v.marca_id is null and nullif(trim(v.marca_nome),'') is not null;
update public.vendas v set produto_id=(
  select min(p.id::text)::uuid from public.produtos p
  where p.marca_id=v.marca_id and lower(trim(p.nome))=lower(trim(v.produto)) having count(*)=1
) where v.produto_id is null;
update public.vendas v set item_id='LEGADO-' || v.id::text where v.item_id is null;
update public.vendas v set campanha_id=(
  select min(c.id::text)::uuid from public.campanhas c
  where c.marca_id=v.marca_id and c.tipo='faturamento_marca'
    and v.data_faturamento >= c.data_inicio::timestamp at time zone 'America/Sao_Paulo'
    and v.data_faturamento < (c.data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
  having count(*)=1
) where v.campanha_id is null;

-- Nenhuma tabela de negócio é acessível diretamente pelo navegador/anon.
-- Retirar policies antigas também protege contra grants acidentais posteriores.
do $$
declare tabela text; politica record;
begin
  foreach tabela in array array['vendedores','campanhas','marcas','produtos','vendas','campanha_marcas'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('revoke all on table public.%I from public, anon, authenticated', tabela);
    for politica in select policyname from pg_policies where schemaname='public' and tablename=tabela loop
      execute format('drop policy %I on public.%I', politica.policyname, tabela);
    end loop;
  end loop;
end $$;
revoke all on all tables in schema jj_private from public, anon, authenticated;

create or replace function jj_private.usuario(p_token text)
returns public.vendedores language plpgsql security definer set search_path=pg_catalog as $$
declare usuario public.vendedores;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Sessão inválida. Entre novamente.';
  end if;
  select v.* into usuario from jj_private.sessoes s
  join public.vendedores v on v.id=s.vendedor_id
  where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    and s.expira_em>now() and v.ativo is true and v.excluido_em is null;
  if usuario.id is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  return usuario;
end $$;

create or replace function public.jj_login(p_username text, p_senha text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; tentativa jj_private.tentativas_login; nome_usuario text; token text;
begin
  nome_usuario:=lower(trim(coalesce(p_username,'')));
  if nome_usuario='' or length(nome_usuario)>80 then
    return jsonb_build_object('error','Usuário ou senha incorretos.');
  end if;
  insert into jj_private.tentativas_login(username) values(nome_usuario) on conflict do nothing;
  select * into tentativa from jj_private.tentativas_login where username=nome_usuario for update;
  if tentativa.janela_inicio <= now()-interval '15 minutes' then
    update jj_private.tentativas_login set tentativas=0, janela_inicio=now() where username=nome_usuario;
    tentativa.tentativas:=0;
  end if;
  if tentativa.tentativas>=5 then
    return jsonb_build_object('error','Muitas tentativas. Aguarde 15 minutos e tente novamente.');
  end if;
  select * into u from public.vendedores where lower(username)=nome_usuario order by id limit 1;
  if p_senha is null or p_senha !~ '^[0-9]{6}$' or u.id is null or u.ativo is not true or u.excluido_em is not null
     or jj_private.senha_hash(p_senha,u.senha) is distinct from u.senha then
    update jj_private.tentativas_login set tentativas=tentativas+1 where username=nome_usuario;
    return jsonb_build_object('error','Usuário ou senha incorretos.');
  end if;
  delete from jj_private.tentativas_login where username=nome_usuario;
  delete from jj_private.sessoes where expira_em<=now();
  token:=jj_private.novo_token();
  insert into jj_private.sessoes(token_hash,vendedor_id) values(encode(sha256(convert_to(token,'UTF8')),'hex'),u.id);
  return jsonb_build_object('user',jsonb_build_object('id',u.id,'username',u.username,'nome',u.nome,'role',u.role),'token',token);
end $$;

create or replace function public.jj_logout(p_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  delete from jj_private.sessoes where token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex');
  return jsonb_build_object('ok',true);
end $$;

-- Fonte única da regra. Campanha é determinada por marca_id + período faturado.
-- O faturamento geral inclui TODAS as marcas e existe somente para desempatar.
-- Um item cancelado conserva bruto/devoluções e cancela o saldo remanescente.
create or replace function public.jj_calcular_ranking()
returns table (
  campanha_id uuid, vendedor_id uuid, vendedor_nome text, marca_id uuid, marca_nome text,
  posicao bigint, faturamento_bruto_marca numeric, valor_devolucoes_marca numeric,
  valor_cancelamentos_marca numeric, faturamento_liquido_marca numeric,
  quantidade_clientes_distintos bigint, faturamento_geral_periodo numeric,
  valor_premio numeric, status_empate text
) language sql stable security definer set search_path=pg_catalog as $$
  with periodos as (
    select c.id, c.marca_id, c.premio_1, c.premio_2, c.premio_3,
      c.data_inicio::timestamp at time zone 'America/Sao_Paulo' as inicio,
      (c.data_fim+1)::timestamp at time zone 'America/Sao_Paulo' as fim
    from public.campanhas c where c.tipo='faturamento_marca' and c.marca_id is not null
  ), itens as (
    select c.id as campanha_id, c.marca_id as marca_campanha, v.vendedor_id, v.marca_id,
      nullif(trim(v.cliente_id),'') as cliente_id,
      coalesce(v.valor_bruto,0) as bruto, coalesce(v.valor_devolucao,0) as devolucao,
      case when v.status='cancelado' then greatest(0,coalesce(v.valor_bruto,0)-coalesce(v.valor_devolucao,0))
           else coalesce(v.valor_cancelamento,0) end as cancelamento
    from periodos c join public.vendas v on v.data_faturamento>=c.inicio and v.data_faturamento<c.fim
    where v.status in ('faturado','cancelado') and v.vendedor_id is not null
  ), liquidos as (
    select *, bruto-devolucao-cancelamento as liquido from itens
  ), geral as (
    select campanha_id,vendedor_id,sum(liquido) as total from liquidos group by campanha_id,vendedor_id
  ), saldos_clientes as (
    select campanha_id,vendedor_id,cliente_id,sum(liquido) as saldo
    from liquidos where marca_id=marca_campanha and cliente_id is not null
    group by campanha_id,vendedor_id,cliente_id
  ), clientes as (
    select campanha_id,vendedor_id,count(*) as quantidade from saldos_clientes where saldo>0 group by campanha_id,vendedor_id
  ), totais as (
    select l.campanha_id,l.vendedor_id,l.marca_campanha as marca_id,
      round(sum(l.bruto),2) as bruto,round(sum(l.devolucao),2) as devolucao,
      round(sum(l.cancelamento),2) as cancelamento,round(sum(l.liquido),2) as liquido,
      coalesce(cl.quantidade,0) as clientes,round(g.total,2) as geral
    from liquidos l join geral g using(campanha_id,vendedor_id)
    left join clientes cl using(campanha_id,vendedor_id)
    where l.marca_id=l.marca_campanha
    group by l.campanha_id,l.vendedor_id,l.marca_campanha,cl.quantidade,g.total
    having sum(l.liquido)>0
  ), ordenados as (
    select *,rank() over(partition by campanha_id order by liquido desc,clientes desc,geral desc) as posicao,
      count(*) over(partition by campanha_id,liquido,clientes,geral) as empatados from totais
  )
  select o.campanha_id,o.vendedor_id,v.nome,o.marca_id,m.nome,o.posicao,
    o.bruto,o.devolucao,o.cancelamento,o.liquido,o.clientes,o.geral,
    case when o.empatados>1 then null
      when o.posicao=1 then c.premio_1 when o.posicao=2 then c.premio_2 when o.posicao=3 then c.premio_3 else 0 end,
    case when o.empatados>1 then 'EMPATE - AGUARDANDO DECISÃO DA DIRETORIA' else null end
  from ordenados o join public.vendedores v on v.id=o.vendedor_id
  join public.marcas m on m.id=o.marca_id join public.campanhas c on c.id=o.campanha_id
  order by o.campanha_id,o.posicao,o.vendedor_id;
$$;

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

-- Resumo por vendedor de UMA campanha: pontos, líquido, itens e última venda, já agregados.
-- Substitui o envio de todas as vendas no bootstrap; inclui zerados e excluídos com histórico.
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

-- Evolução diária de pontos de UMA campanha, opcionalmente de um vendedor. Inclui o dia inicial zerado.
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

-- Datas de faturamento dos itens informados, para a prévia de reimportação sem baixar todas as vendas.
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

create or replace function public.jj_importar(p_token text,p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; linha jsonb; n integer:=0; vend public.vendedores; marca public.marcas;
  codigo text; data_fat timestamptz; bruto numeric; devolucao numeric; cancelamento numeric; qtd numeric;
  estado text; cliente text; produto text; prod_id uuid; camp_id uuid; camp_nome text;
  inseridas integer:=0; atualizadas integer:=0; existentes text[]; usuario_venda text;
  produto_cadastrado public.produtos; valor_ponto numeric; preco_base numeric; pontos_base numeric;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode importar vendas.'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas)=0 then
    raise exception 'A importação deve conter ao menos uma linha.';
  end if;
  if jsonb_array_length(p_linhas)>5000 then raise exception 'Importe até 5.000 itens por arquivo.'; end if;
  if exists(select 1 from jsonb_array_elements(p_linhas) x group by trim(x->>'item_id') having count(*)>1) then
    raise exception 'O arquivo contém item_id repetido. Cada item faturado deve ter um código único.';
  end if;
  -- Serializa importações para contar inserções/atualizações de modo consistente.
  perform pg_advisory_xact_lock(7482026);
  -- A regra do produto não pode mudar no meio de uma importação de vendas.
  perform pg_advisory_xact_lock(7482028);
  select coalesce(array_agg(v.item_id),'{}') into existentes from public.vendas v
    where v.item_id in (select trim(x->>'item_id') from jsonb_array_elements(p_linhas) x);
  for linha in select value from jsonb_array_elements(p_linhas) loop
    n:=n+1;
    if jsonb_typeof(linha)<>'object' then raise exception 'Linha %: formato inválido.',n; end if;
    codigo:=trim(coalesce(linha->>'item_id',''));
    usuario_venda:=lower(trim(coalesce(linha->>'vendedor','')));
    cliente:=trim(coalesce(linha->>'cliente_id',''));
    produto:=trim(coalesce(linha->>'produto',''));
    estado:=lower(trim(coalesce(linha->>'status','')));
    if codigo='' or length(codigo)>160 then raise exception 'Linha %: informe item_id com até 160 caracteres.',n; end if;
    if cliente='' or length(cliente)>160 then raise exception 'Linha %: cliente_id é obrigatório (até 160 caracteres).',n; end if;
    if produto='' or length(produto)>300 then raise exception 'Linha %: produto é obrigatório (até 300 caracteres).',n; end if;
    if estado not in ('faturado','cancelado','pendente') then raise exception 'Linha %: situação deve ser faturado, cancelado ou pendente.',n; end if;
    select * into vend from public.vendedores where username=usuario_venda and role='vendedor' and ativo is true and excluido_em is null;
    if vend.id is null then raise exception 'Linha %: vendedor não cadastrado.',n; end if;
    select * into marca from public.marcas where id::text=linha->>'marca_id';
    if marca.id is null then raise exception 'Linha %: marca_id não cadastrado.',n; end if;
    -- Data deve trazer fuso explícito. Nunca usar o timezone da sessão/banco.
    if coalesce(linha->>'data_faturamento','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
      raise exception 'Linha %: data_faturamento precisa de data, hora e fuso explícito.',n;
    end if;
    begin
      data_fat:=(linha->>'data_faturamento')::timestamptz;
      qtd:=(linha->>'quantidade')::numeric;
      bruto:=(linha->>'valor_bruto')::numeric;
      devolucao:=coalesce((linha->>'valor_devolucao')::numeric,0);
      cancelamento:=coalesce((linha->>'valor_cancelamento')::numeric,0);
    exception when others then raise exception 'Linha %: data ou valores inválidos.',n;
    end;
    if qtd is null or qtd<=0 or qtd::text in ('NaN','Infinity','-Infinity') then raise exception 'Linha %: quantidade deve ser positiva.',n; end if;
    if bruto is null or bruto<0 or devolucao<0 or cancelamento<0
      or bruto::text in ('NaN','Infinity','-Infinity') or devolucao::text in ('NaN','Infinity','-Infinity') or cancelamento::text in ('NaN','Infinity','-Infinity')
      or bruto<>round(bruto,2) or devolucao<>round(devolucao,2) or cancelamento<>round(cancelamento,2) then
      raise exception 'Linha %: valores devem ser positivos ou zero, com até duas casas decimais.',n;
    end if;
    if devolucao+cancelamento>bruto then raise exception 'Linha %: devolução e cancelamento ultrapassam o valor bruto.',n; end if;
    select min(p.id::text)::uuid into prod_id from public.produtos p where p.marca_id=marca.id and p.excluido_em is null
      and (lower(trim(p.nome))=lower(produto) or lower(trim(p.codigo_externo))=lower(produto)) having count(*)=1;
    if prod_id is null then raise exception 'Linha %: produto não cadastrado ou nome ambíguo nesta marca. Confira o cadastro de Produtos.',n; end if;
    select * into produto_cadastrado from public.produtos where id=prod_id;
    if produto_cadastrado.ativo is not true then raise exception 'Linha %: produto inativo. Confira o cadastro de Produtos.',n; end if;
    valor_ponto:=produto_cadastrado.valor_por_ponto;
    preco_base:=produto_cadastrado.preco_venda;
    pontos_base:=produto_cadastrado.pontos_por_real;
    if (pontos_base is null and (valor_ponto is null or valor_ponto<=0)) or pontos_base<=0 then raise exception 'Linha %: configure os pontos por real desse produto.',n; end if;
    select min(c.id::text)::uuid,min(c.nome) into camp_id,camp_nome from public.campanhas c
      where c.marca_id=marca.id and c.tipo='faturamento_marca'
      and data_fat>=c.data_inicio::timestamp at time zone 'America/Sao_Paulo'
      and data_fat<(c.data_fim+1)::timestamp at time zone 'America/Sao_Paulo'
      having count(*)=1;
    if exists(select 1 from public.campanhas c where c.marca_id=marca.id and c.tipo='faturamento_marca'
      and data_fat>=c.data_inicio::timestamp at time zone 'America/Sao_Paulo'
      and data_fat<(c.data_fim+1)::timestamp at time zone 'America/Sao_Paulo' group by c.marca_id having count(*)>1) then
      raise exception 'Linha %: a marca tem campanhas com períodos sobrepostos. Corrija os cadastros.',n;
    end if;
    insert into public.vendas(item_id,vendedor_id,vendedor,produto_id,produto,marca_id,marca_nome,campanha_id,campanha,
      quantidade,pontos,valor_por_ponto,preco_venda,pontos_por_real,data_faturamento,valor_bruto,valor_devolucao,valor_cancelamento,cliente_id,status)
    values(codigo,vend.id,vend.username,prod_id,produto_cadastrado.nome,marca.id,marca.nome,camp_id,coalesce(camp_nome,''),
      qtd,case when estado='faturado' then round(case when pontos_base is not null then (bruto-devolucao-cancelamento)*pontos_base else (bruto-devolucao-cancelamento)/valor_ponto end,2) else 0 end,valor_ponto,preco_base,pontos_base,data_fat,bruto,devolucao,cancelamento,cliente,estado)
    on conflict(item_id) do update set vendedor_id=excluded.vendedor_id,vendedor=excluded.vendedor,
      produto_id=excluded.produto_id,produto=excluded.produto,marca_id=excluded.marca_id,marca_nome=excluded.marca_nome,
      campanha_id=excluded.campanha_id,campanha=excluded.campanha,quantidade=excluded.quantidade,pontos=excluded.pontos,valor_por_ponto=excluded.valor_por_ponto,
      preco_venda=excluded.preco_venda,pontos_por_real=excluded.pontos_por_real,
      data_faturamento=excluded.data_faturamento,valor_bruto=excluded.valor_bruto,valor_devolucao=excluded.valor_devolucao,
      valor_cancelamento=excluded.valor_cancelamento,cliente_id=excluded.cliente_id,status=excluded.status;
    if codigo=any(existentes) then atualizadas:=atualizadas+1; else inseridas:=inseridas+1; end if;
  end loop;
  return jsonb_build_object('inseridas',inseridas,'atualizadas',atualizadas,'total',n);
end $$;

create or replace function public.jj_salvar(p_token text,p_entidade text,p_item jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; codigo uuid; resultado jsonb; registro public.vendedores;
  nome_novo text; usuario_novo text; senha_nova text; papel text; marca uuid; inicio date; fim date;
  primeiro numeric; segundo numeric; terceiro numeric; valor_ponto_novo numeric; preco_novo numeric; pontos_novos numeric; codigo_produto text;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode alterar cadastros.'; end if;
  if p_entidade not in ('campanhas','marcas','produtos','vendedores') then raise exception 'Cadastro inválido.'; end if;
  if jsonb_typeof(p_item) is distinct from 'object' then raise exception 'Dados do cadastro inválidos.'; end if;
  codigo:=coalesce(nullif(p_item->>'id','')::uuid,gen_random_uuid());
  nome_novo:=trim(coalesce(p_item->>'nome',''));
  if nome_novo='' or length(nome_novo)>160 then raise exception 'Informe um nome com até 160 caracteres.'; end if;
  if p_entidade='marcas' then
    if nullif(trim(p_item->>'codigo_externo'),'') is null then raise exception 'Informe o código externo da marca.'; end if;
    if exists(select 1 from public.marcas m where m.id<>codigo and
      (lower(trim(m.codigo_externo))=lower(trim(p_item->>'codigo_externo')) or lower(m.nome)=lower(nome_novo))) then
      raise exception 'Já existe uma marca com esse nome ou código.';
    end if;
    insert into public.marcas(id,nome,codigo_externo,ativa) values(codigo,nome_novo,trim(p_item->>'codigo_externo'),coalesce((p_item->>'ativa')::boolean,true))
      on conflict(id) do update set nome=excluded.nome,codigo_externo=excluded.codigo_externo,ativa=excluded.ativa
      returning to_jsonb(marcas.*) into resultado;
  elsif p_entidade='vendedores' then
    select * into registro from public.vendedores where id=codigo;
    if registro.excluido_em is not null then raise exception 'Este vendedor foi excluído. Cadastre um novo acesso.'; end if;
    usuario_novo:=lower(trim(coalesce(p_item->>'username',registro.username,'')));
    papel:=coalesce(p_item->>'role',registro.role,'vendedor');
    senha_nova:=nullif(p_item->>'senha','');
    if usuario_novo !~ '^[a-z0-9][a-z0-9._-]{2,79}$' then raise exception 'Usuário deve ter de 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado.'; end if;
    if registro.id is not null and usuario_novo<>registro.username then raise exception 'O nome de usuário não pode ser alterado.'; end if;
    if papel not in ('admin','vendedor') then raise exception 'Perfil inválido.'; end if;
    if (registro.id is null and senha_nova is null) or (senha_nova is not null and senha_nova !~ '^[0-9]{6}$') then
      raise exception 'A senha deve ter exatamente 6 dígitos.';
    end if;
    if codigo=u.id and (papel<>'admin' or coalesce((p_item->>'ativo')::boolean,true)=false) then
      raise exception 'Você não pode desativar ou remover seu próprio acesso de diretoria.';
    end if;
    if exists(select 1 from public.vendedores v where v.id<>codigo and lower(v.username)=usuario_novo) then raise exception 'Este usuário já existe.'; end if;
    insert into public.vendedores(id,username,nome,senha,role,ativo)
      values(codigo,usuario_novo,nome_novo,case when senha_nova is not null then jj_private.senha_hash(senha_nova) else registro.senha end,papel,coalesce((p_item->>'ativo')::boolean,true))
      on conflict(id) do update set nome=excluded.nome,senha=excluded.senha,role=excluded.role,ativo=excluded.ativo
      returning to_jsonb(vendedores.*)-'senha' into resultado;
    if senha_nova is not null or papel is distinct from registro.role or (resultado->>'ativo')::boolean=false then
      delete from jj_private.sessoes where vendedor_id=codigo;
    end if;
  elsif p_entidade='produtos' then
    perform pg_advisory_xact_lock(7482028);
    if exists(select 1 from public.produtos p where p.id=codigo and p.excluido_em is not null) then
      raise exception 'Este produto foi excluído. Cadastre ou importe um novo produto.';
    end if;
    marca:=nullif(p_item->>'marca_id','')::uuid;
    if not exists(select 1 from public.marcas m where m.id=marca) then raise exception 'Selecione uma marca cadastrada.'; end if;
    valor_ponto_novo:=(p_item->>'valor_por_ponto')::numeric;
    preco_novo:=(p_item->>'preco_venda')::numeric;
    pontos_novos:=(p_item->>'pontos_por_real')::numeric;
    if preco_novo is not null or pontos_novos is not null then
      if preco_novo is null or pontos_novos is null or preco_novo<=0 or pontos_novos<=0
        or preco_novo>=10000000000 or pontos_novos>=10000000000
        or preco_novo::text in ('NaN','Infinity','-Infinity') or pontos_novos::text in ('NaN','Infinity','-Infinity')
        or preco_novo<>round(preco_novo,2) or pontos_novos<>round(pontos_novos,2) then
        raise exception 'Preço de venda e pontos por real devem ser maiores que zero, com até duas casas decimais.';
      end if;
      valor_ponto_novo:=null;
    elsif valor_ponto_novo is null or valor_ponto_novo<=0 or valor_ponto_novo>=10000000000 or valor_ponto_novo::text in ('NaN','Infinity','-Infinity')
      or valor_ponto_novo<>round(valor_ponto_novo,2) then raise exception 'Informe o valor em reais para 1 ponto: maior que zero, com até duas casas decimais.'; end if;
    codigo_produto:=nullif(trim(p_item->>'codigo_externo'),'');
    if length(codigo_produto)>160 then raise exception 'Código do produto deve ter até 160 caracteres.'; end if;
    if exists(select 1 from public.produtos p where p.id<>codigo and p.excluido_em is null and p.marca_id=marca and lower(trim(p.nome))=lower(nome_novo)) then
      raise exception 'Já existe um produto com esse nome nesta marca. Edite o cadastro existente.';
    end if;
    if codigo_produto is not null and exists(select 1 from public.produtos p where p.id<>codigo and p.excluido_em is null and p.marca_id=marca and lower(trim(p.codigo_externo))=lower(codigo_produto)) then
      raise exception 'Já existe um produto com esse código nesta marca. Edite o cadastro existente.';
    end if;
    insert into public.produtos(id,nome,marca_id,marca_nome,codigo_externo,valor_por_ponto,preco_venda,pontos_por_real,ativo)
      values(codigo,nome_novo,marca,(select m.nome from public.marcas m where m.id=marca),codigo_produto,valor_ponto_novo,preco_novo,pontos_novos,coalesce((p_item->>'ativo')::boolean,true))
      on conflict(id) do update set nome=excluded.nome,marca_id=excluded.marca_id,marca_nome=excluded.marca_nome,codigo_externo=excluded.codigo_externo,valor_por_ponto=excluded.valor_por_ponto,preco_venda=excluded.preco_venda,pontos_por_real=excluded.pontos_por_real,ativo=excluded.ativo
      returning to_jsonb(produtos.*) into resultado;
    update public.vendas v set valor_por_ponto=valor_ponto_novo,preco_venda=preco_novo,pontos_por_real=pontos_novos,
      pontos=case when v.status='faturado' then round(case when pontos_novos is not null
        then greatest(0,coalesce(v.valor_bruto,0)-coalesce(v.valor_devolucao,0)-coalesce(v.valor_cancelamento,0))*pontos_novos
        else greatest(0,coalesce(v.valor_bruto,0)-coalesce(v.valor_devolucao,0)-coalesce(v.valor_cancelamento,0))/valor_ponto_novo end,2) else 0 end
      where v.produto_id=codigo;
  else
    perform pg_advisory_xact_lock(7482027);
    marca:=nullif(p_item->>'marca_id','')::uuid;
    if not exists(select 1 from public.marcas m where m.id=marca) then raise exception 'Selecione a marca da campanha.'; end if;
    inicio:=(p_item->>'data_inicio')::date; fim:=(p_item->>'data_fim')::date;
    if inicio is null or fim is null or inicio>fim then raise exception 'Informe um período válido para a campanha.'; end if;
    primeiro:=coalesce((p_item->>'premio_1')::numeric,2000); segundo:=coalesce((p_item->>'premio_2')::numeric,1500); terceiro:=coalesce((p_item->>'premio_3')::numeric,500);
    if primeiro<0 or segundo<0 or terceiro<0 or primeiro::text in ('NaN','Infinity','-Infinity')
      or segundo::text in ('NaN','Infinity','-Infinity') or terceiro::text in ('NaN','Infinity','-Infinity')
      or primeiro<>round(primeiro,2) or segundo<>round(segundo,2) or terceiro<>round(terceiro,2) then raise exception 'Prêmios devem ser valores válidos, positivos ou zero, com até duas casas decimais.'; end if;
    if exists(select 1 from public.campanhas c where c.id<>codigo and c.marca_id=marca and c.tipo='faturamento_marca'
      and c.data_inicio<=fim and c.data_fim>=inicio) then raise exception 'Esta marca já tem uma campanha nesse período.'; end if;
    insert into public.campanhas(id,nome,descricao,marca_id,tipo,data_inicio,data_fim,ativa,premio_1,premio_2,premio_3)
      values(codigo,nome_novo,coalesce(p_item->>'descricao',''),marca,'faturamento_marca',inicio,fim,coalesce((p_item->>'ativa')::boolean,true),primeiro,segundo,terceiro)
      on conflict(id) do update set nome=excluded.nome,descricao=excluded.descricao,marca_id=excluded.marca_id,tipo=excluded.tipo,
        data_inicio=excluded.data_inicio,data_fim=excluded.data_fim,ativa=excluded.ativa,premio_1=excluded.premio_1,premio_2=excluded.premio_2,premio_3=excluded.premio_3
      returning to_jsonb(campanhas.*) into resultado;
    delete from public.campanha_marcas where campanha_id=codigo;
    insert into public.campanha_marcas(campanha_id,marca_id) values(codigo,marca);
    -- Mantém o histórico e sua campanha de exibição alinhados ao vínculo atual.
    update public.vendas v set campanha_id=null,campanha='' where v.campanha_id=codigo;
    update public.vendas v set campanha_id=codigo,campanha=nome_novo where v.marca_id=marca
      and v.data_faturamento>=inicio::timestamp at time zone 'America/Sao_Paulo'
      and v.data_faturamento<(fim+1)::timestamp at time zone 'America/Sao_Paulo';
  end if;
  return resultado;
end $$;

create or replace function public.jj_excluir_vendedor(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; alvo public.vendedores;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode excluir vendedores.'; end if;
  select * into alvo from public.vendedores where id=p_id for update;
  if alvo.id is null or alvo.excluido_em is not null then raise exception 'Vendedor não encontrado.'; end if;
  if alvo.role<>'vendedor' or alvo.id=u.id then raise exception 'Não é permitido excluir um acesso de diretoria.'; end if;
  update public.vendedores set ativo=false,excluido_em=now() where id=p_id;
  delete from jj_private.sessoes where vendedor_id=p_id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.jj_excluir_produto(p_token text,p_id uuid,p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode excluir produtos.'; end if;
  if p_confirmar is distinct from true then raise exception 'Confirme a exclusão do produto.'; end if;
  perform pg_advisory_xact_lock(7482028);
  update public.produtos set ativo=false,excluido_em=clock_timestamp() where id=p_id and excluido_em is null;
  if not found then raise exception 'Produto não encontrado ou já excluído.'; end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.jj_importar_produtos(p_token text,p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; linha jsonb; existente public.produtos; salvos jsonb; n integer:=0; novos integer:=0; atualizados integer:=0; vistos uuid[]:='{}';
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode importar produtos.'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas)<1 or jsonb_array_length(p_linhas)>5000 then
    raise exception 'Envie entre 1 e 5.000 produtos.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_linhas) x group by lower(trim(x->>'nome')),x->>'marca_id' having count(*)>1) then
    raise exception 'Há produtos repetidos na mesma marca. Mantenha uma linha por produto.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_linhas) x where nullif(trim(x->>'codigo_externo'),'') is not null
    group by lower(trim(x->>'codigo_externo')),x->>'marca_id' having count(*)>1) then
    raise exception 'Há códigos de produtos repetidos na mesma marca.';
  end if;
  perform pg_advisory_xact_lock(7482028);
  for linha in select value from jsonb_array_elements(p_linhas) loop
    n:=n+1;
    if jsonb_typeof(linha)<>'object' then raise exception 'Linha %: formato inválido.',n; end if;
    if (select count(*) from public.produtos p where p.excluido_em is null and p.marca_id::text=linha->>'marca_id' and (lower(trim(p.nome))=lower(trim(linha->>'nome'))
      or lower(trim(p.codigo_externo))=lower(nullif(trim(linha->>'codigo_externo'),''))))>1 then
      raise exception 'Linha %: há cadastros duplicados desse produto. Corrija em Produtos.',n;
    end if;
    select * into existente from public.produtos p where p.excluido_em is null and p.marca_id::text=linha->>'marca_id' and (lower(trim(p.nome))=lower(trim(linha->>'nome'))
      or lower(trim(p.codigo_externo))=lower(nullif(trim(linha->>'codigo_externo'),'')));
    if existente.id=any(vistos) then raise exception 'Linha %: este produto já foi informado em outra linha.',n; end if;
    salvos:=public.jj_salvar(p_token,'produtos',jsonb_build_object('id',existente.id,'nome',linha->>'nome','marca_id',linha->>'marca_id',
      'valor_por_ponto',linha->'valor_por_ponto','preco_venda',linha->'preco_venda','pontos_por_real',linha->'pontos_por_real',
      'codigo_externo',coalesce(nullif(trim(linha->>'codigo_externo'),''),existente.codigo_externo),'ativo',coalesce(existente.ativo,true)));
    vistos:=array_append(vistos,(salvos->>'id')::uuid);
    if existente.id is null then novos:=novos+1; else atualizados:=atualizados+1; end if;
  end loop;
  return jsonb_build_object('inseridas',novos,'atualizadas',atualizados,'total',n);
end $$;

revoke all on all functions in schema jj_private from public, anon, authenticated;
revoke all on function public.jj_calcular_ranking() from public, anon, authenticated;
revoke all on function public.jj_login(text,text),public.jj_logout(text),public.jj_bootstrap(text),public.jj_importar(text,jsonb),public.jj_salvar(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.jj_login(text,text),public.jj_logout(text),public.jj_bootstrap(text),public.jj_importar(text,jsonb),public.jj_salvar(text,text,jsonb) to anon,authenticated;
revoke all on function public.jj_resumo_campanha(text,uuid),public.jj_evolucao_campanha(text,uuid,uuid),public.jj_datas_itens(text,jsonb) from public,anon,authenticated;
grant execute on function public.jj_resumo_campanha(text,uuid),public.jj_evolucao_campanha(text,uuid,uuid),public.jj_datas_itens(text,jsonb) to anon,authenticated;
revoke all on function public.jj_excluir_vendedor(text,uuid),public.jj_importar_produtos(text,jsonb) from public,anon,authenticated;
revoke all on function public.jj_excluir_produto(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.jj_excluir_produto(text,uuid,boolean) to anon,authenticated;
grant execute on function public.jj_excluir_vendedor(text,uuid),public.jj_importar_produtos(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
