-- Campanhas JJ • Backend completo (Modelo: Valor Vendido / Categorias)
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Recria as tabelas de negócio. Vendedores são preservados (criados se não existirem).

-- ===================== LIMPEZA =====================
drop schema if exists jj_private cascade;
drop table if exists public.vendas cascade;
drop table if exists public.categorias cascade;
drop table if exists public.importacoes cascade;
drop table if exists public.campanhas cascade;

drop function if exists public.jj_login(text, text);
drop function if exists public.jj_logout(text);
drop function if exists public.jj_bootstrap(text);
drop function if exists public.jj_salvar(text, text, jsonb);
drop function if exists public.jj_excluir_vendedor(text, uuid);
drop function if exists public.jj_excluir_campanha(text, uuid, boolean);
drop function if exists public.jj_excluir_categoria(text, uuid);
drop function if exists public.jj_importar(text, jsonb);
drop function if exists public.jj_resumo_campanha(text, uuid);
drop function if exists public.jj_evolucao_campanha(text, uuid, uuid);
drop function if exists public.jj_calcular_ranking();
drop function if exists public.jj_auditoria_listar(text, integer, text);
drop function if exists public.jj_auditoria_detalhe(text, uuid, integer);
drop function if exists public.jj_auditoria_desfazer(text, uuid, boolean);

-- ===================== ESTRUTURA =====================
create extension if not exists pgcrypto;
create schema if not exists jj_private;

create table if not exists public.vendedores (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  nome text not null,
  senha text not null,
  role text not null default 'vendedor' check (role in ('admin','vendedor')),
  ativo boolean default true,
  excluido_em timestamptz,
  created_at timestamp with time zone default now()
);

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  descricao text default '',
  data_inicio date not null,
  data_fim date not null,
  ativa boolean default true,
  premio_1 numeric(12,2) default 2000,
  premio_2 numeric(12,2) default 1500,
  premio_3 numeric(12,2) default 500,
  created_at timestamp with time zone default now()
);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  ativa boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.importacoes (
  id uuid primary key default gen_random_uuid(),
  ordem bigserial not null,
  arquivo text not null,
  autor_id uuid references public.vendedores(id),
  autor_nome text not null,
  autor_username text not null,
  total integer not null default 0,
  inseridas integer not null default 0,
  valor_total numeric(18,2) not null default 0,
  linhas jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  desfeita_em timestamptz,
  desfeita_por_nome text
);

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid references public.vendedores(id),
  vendedor_nome text not null,
  valor_vendido numeric(18,2) not null default 0,
  categoria_nome text not null,
  campanha_id uuid references public.campanhas(id),
  importacao_id uuid references public.importacoes(id),
  data_faturamento timestamp with time zone not null,
  created_at timestamp with time zone default now()
);

create index if not exists idx_vendas_campanha on public.vendas(campanha_id);
create index if not exists idx_vendas_vendedor on public.vendas(vendedor_id);
create index if not exists idx_vendas_importacao on public.vendas(importacao_id);

create table if not exists jj_private.sessoes (
  token_hash text primary key,
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  expira_em timestamptz not null default now() + interval '12 hours'
);

-- ===================== HELPERS =====================
create or replace function jj_private.usuario(p_token text)
returns public.vendedores language plpgsql security definer set search_path = public, extensions, pg_catalog as $$
declare u public.vendedores;
begin
  select v.* into u from jj_private.sessoes s
  join public.vendedores v on v.id = s.vendedor_id
  where s.token_hash = encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex')
    and s.expira_em > now() and v.ativo is true and v.excluido_em is null;
  if u.id is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  return u;
end $$;

-- ===================== AUTENTICAÇÃO =====================
create or replace function public.jj_login(p_username text, p_senha text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; token text;
begin
  select * into u from public.vendedores
   where lower(username) = lower(trim(coalesce(p_username,''))) and ativo is true and excluido_em is null;
  if u.id is null or u.senha <> crypt(coalesce(p_senha,''), u.senha) then
    return jsonb_build_object('error', 'Usuário ou senha incorretos.');
  end if;
  delete from jj_private.sessoes where expira_em <= now();
  token := encode(gen_random_bytes(32), 'hex');
  insert into jj_private.sessoes(token_hash, vendedor_id)
  values (encode(sha256(convert_to(token,'UTF8')),'hex'), u.id);
  return jsonb_build_object(
    'token', token,
    'user', jsonb_build_object('id', u.id, 'username', u.username, 'nome', u.nome, 'role', u.role)
  );
end $$;

create or replace function public.jj_logout(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from jj_private.sessoes
   where token_hash = encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex');
  return jsonb_build_object('ok', true);
end $$;

-- ===================== RANKING =====================
create or replace function public.jj_calcular_ranking()
returns table (
  campanha_id uuid, categoria_nome text, vendedor_id uuid, vendedor_nome text, posicao bigint,
  total_vendido numeric, itens bigint, valor_premio numeric, status_empate text
) language sql stable security definer set search_path = public, extensions as $$
  with totais as (
    select s.campanha_id, s.categoria_nome, s.vendedor_id, max(s.vendedor_nome) as vendedor_nome,
           sum(s.valor_vendido) as total, count(*) as itens
    from public.vendas s where s.vendedor_id is not null
    group by s.campanha_id, s.categoria_nome, s.vendedor_id
  ), ordenados as (
    select t.*, rank() over (partition by campanha_id, categoria_nome order by total desc) as posicao,
           count(*) over (partition by campanha_id, categoria_nome, total) as empatados
    from totais t
  )
  select o.campanha_id, o.categoria_nome, o.vendedor_id, o.vendedor_nome, o.posicao,
    round(o.total, 2), o.itens,
    case when o.empatados > 1 then null
         when o.posicao = 1 then c.premio_1
         when o.posicao = 2 then c.premio_2
         when o.posicao = 3 then c.premio_3
         else 0 end,
    case when o.empatados > 1 then 'EMPATE - AGUARDANDO DECISÃO DA DIRETORIA' else null end
  from ordenados o join public.campanhas c on c.id = o.campanha_id
  order by o.campanha_id, o.categoria_nome, o.posicao;
$$;

-- ===================== BOOTSTRAP =====================
create or replace function public.jj_bootstrap(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; resultado jsonb;
begin
  u := jj_private.usuario(p_token);
  select jsonb_build_object(
    'versao_regras', 4,
    'user', jsonb_build_object('id', u.id, 'username', u.username, 'nome', u.nome, 'role', u.role),
    'campanhas', (select coalesce(jsonb_agg(to_jsonb(c) order by c.nome),'[]'::jsonb) from public.campanhas c),
    'categorias', (select coalesce(jsonb_agg(to_jsonb(ct) order by ct.nome),'[]'::jsonb) from public.categorias ct where ct.ativa is true),
    'vendedores', (
      select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'username',v.username,'nome',v.nome,'role',v.role,'ativo',v.ativo) order by v.nome),'[]'::jsonb)
      from public.vendedores v where v.excluido_em is null and (u.role = 'admin' or v.id = u.id)
    ),
    'vendas', '[]'::jsonb,
    'vendas_total', (select case when u.role = 'admin' then (select count(*) from public.vendas) else 0 end),
    'rankings', (
      select coalesce(jsonb_agg(case when u.role = 'admin'
        then to_jsonb(r)
        else jsonb_build_object('campanha_id', r.campanha_id, 'categoria_nome', r.categoria_nome, 'vendedor_id', r.vendedor_id, 'posicao', r.posicao)
      end order by r.campanha_id, r.categoria_nome, r.posicao),'[]'::jsonb)
      from public.jj_calcular_ranking() r where u.role = 'admin' or r.vendedor_id = u.id
    )
  ) into resultado;
  return resultado;
end $$;

-- ===================== CADASTROS =====================
create or replace function public.jj_salvar(p_token text, p_entidade text, p_item jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; codigo uuid; resultado jsonb; reg public.vendedores;
  nome_novo text; usuario_novo text; senha_nova text; papel text; inicio date; fim date;
  p1 numeric; p2 numeric; p3 numeric;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode alterar cadastros.'; end if;
  if p_entidade not in ('campanhas','categorias','vendedores') then raise exception 'Cadastro inválido.'; end if;
  if jsonb_typeof(p_item) is distinct from 'object' then raise exception 'Dados do cadastro inválidos.'; end if;
  codigo := coalesce(nullif(p_item->>'id','')::uuid, gen_random_uuid());
  nome_novo := trim(coalesce(p_item->>'nome',''));
  if nome_novo = '' or length(nome_novo) > 160 then raise exception 'Informe um nome com até 160 caracteres.'; end if;

  if p_entidade = 'categorias' then
    if exists(select 1 from public.categorias c where c.id <> codigo and lower(c.nome) = lower(nome_novo)) then
      raise exception 'Já existe uma categoria com esse nome.';
    end if;
    insert into public.categorias(id, nome, ativa)
      values(codigo, nome_novo, coalesce((p_item->>'ativa')::boolean, true))
      on conflict(id) do update set nome = excluded.nome, ativa = excluded.ativa
      returning to_jsonb(categorias.*) into resultado;

  elsif p_entidade = 'vendedores' then
    select * into reg from public.vendedores where id = codigo;
    if reg.excluido_em is not null then raise exception 'Este vendedor foi excluído. Cadastre um novo acesso.'; end if;
    usuario_novo := lower(trim(coalesce(p_item->>'username', reg.username, '')));
    papel := coalesce(p_item->>'role', reg.role, 'vendedor');
    senha_nova := nullif(p_item->>'senha','');
    if usuario_novo !~ '^[a-z0-9][a-z0-9._-]{2,79}$' then
      raise exception 'Usuário deve ter de 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado.';
    end if;
    if reg.id is not null and usuario_novo <> reg.username then raise exception 'O nome de usuário não pode ser alterado.'; end if;
    if papel not in ('admin','vendedor') then raise exception 'Perfil inválido.'; end if;
    if (reg.id is null and senha_nova is null) or (senha_nova is not null and senha_nova !~ '^[0-9]{6}$') then
      raise exception 'A senha deve ter exatamente 6 dígitos.';
    end if;
    if codigo = u.id and (papel <> 'admin' or coalesce((p_item->>'ativo')::boolean, true) = false) then
      raise exception 'Você não pode desativar ou remover seu próprio acesso de diretoria.';
    end if;
    if exists(select 1 from public.vendedores v where v.id <> codigo and lower(v.username) = usuario_novo) then
      raise exception 'Este usuário já existe.';
    end if;
    insert into public.vendedores(id, username, nome, senha, role, ativo)
      values(codigo, usuario_novo, nome_novo,
        case when senha_nova is not null then crypt(senha_nova, gen_salt('bf', 10)) else reg.senha end,
        papel, coalesce((p_item->>'ativo')::boolean, true))
      on conflict(id) do update set nome = excluded.nome, senha = excluded.senha, role = excluded.role, ativo = excluded.ativo
      returning to_jsonb(vendedores.*) - 'senha' into resultado;
    if senha_nova is not null or papel is distinct from reg.role or (resultado->>'ativo')::boolean = false then
      delete from jj_private.sessoes where vendedor_id = codigo;
    end if;

  else
    inicio := (p_item->>'data_inicio')::date; fim := (p_item->>'data_fim')::date;
    if inicio is null or fim is null or inicio > fim then raise exception 'Informe um período válido para a campanha.'; end if;
    p1 := coalesce((p_item->>'premio_1')::numeric, 2000);
    p2 := coalesce((p_item->>'premio_2')::numeric, 1500);
    p3 := coalesce((p_item->>'premio_3')::numeric, 500);
    if p1 < 0 or p2 < 0 or p3 < 0 then raise exception 'Prêmios devem ser valores iguais ou maiores que zero.'; end if;
    if exists(select 1 from public.campanhas c where c.id <> codigo and lower(c.nome) = lower(nome_novo)) then
      raise exception 'Já existe uma campanha com esse nome.';
    end if;
    insert into public.campanhas(id, nome, descricao, data_inicio, data_fim, ativa, premio_1, premio_2, premio_3)
      values(codigo, nome_novo, coalesce(p_item->>'descricao',''), inicio, fim,
        coalesce((p_item->>'ativa')::boolean, true), p1, p2, p3)
      on conflict(id) do update set nome = excluded.nome, descricao = excluded.descricao,
        data_inicio = excluded.data_inicio, data_fim = excluded.data_fim, ativa = excluded.ativa,
        premio_1 = excluded.premio_1, premio_2 = excluded.premio_2, premio_3 = excluded.premio_3
      returning to_jsonb(campanhas.*) into resultado;
  end if;
  return resultado;
end $$;

create or replace function public.jj_excluir_vendedor(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; alvo public.vendedores;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode excluir vendedores.'; end if;
  select * into alvo from public.vendedores where id = p_id for update;
  if alvo.id is null or alvo.excluido_em is not null then raise exception 'Vendedor não encontrado.'; end if;
  if alvo.role <> 'vendedor' or alvo.id = u.id then raise exception 'Não é permitido excluir um acesso de diretoria.'; end if;
  update public.vendedores set ativo = false, excluido_em = now() where id = p_id;
  delete from jj_private.sessoes where vendedor_id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.jj_excluir_campanha(p_token text, p_id uuid, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode excluir campanhas.'; end if;
  if p_confirmar is distinct from true then raise exception 'Confirme a exclusão da campanha.'; end if;
  update public.vendas set campanha_id = null where campanha_id = p_id;
  delete from public.campanhas where id = p_id;
  if not found then raise exception 'Campanha não encontrada.'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.jj_excluir_categoria(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode excluir categorias.'; end if;
  delete from public.categorias where id = p_id;
  if not found then raise exception 'Categoria não encontrada.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ===================== IMPORTAÇÃO =====================
create or replace function public.jj_importar(p_token text, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; linha jsonb; n integer := 0; inseridas integer := 0;
  vend public.vendedores; cat public.categorias; camp public.campanhas;
  usuario text; categoria text; valor numeric; camp_id uuid; arquivo text;
  preview jsonb := '[]'::jsonb; imp_id uuid; total_valor numeric := 0; data_fat timestamptz;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode importar vendas.'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'A importação deve conter ao menos uma linha.';
  end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Importe até 5.000 itens por arquivo.'; end if;

  camp_id := nullif(p_linhas->0->>'campanha_id','')::uuid;
  select * into camp from public.campanhas where id = camp_id;
  if camp.id is null then raise exception 'Selecione uma campanha válida para a importação.'; end if;
  arquivo := coalesce(nullif(trim(p_linhas->0->>'arquivo'),''), 'importacao.xlsx');

  insert into public.importacoes(arquivo, autor_id, autor_nome, autor_username)
    values(arquivo, u.id, u.nome, u.username) returning id into imp_id;

  for linha in select value from jsonb_array_elements(p_linhas) loop
    n := n + 1;
    usuario := lower(trim(coalesce(linha->>'vendedor','')));
    categoria := trim(coalesce(linha->>'categoria',''));
    if usuario = '' then raise exception 'Linha %: informe o vendedor.', n; end if;
    if categoria = '' or length(categoria) > 160 then raise exception 'Linha %: informe a categoria.', n; end if;
    begin
      valor := (linha->>'valor_vendido')::numeric;
      data_fat := coalesce((linha->>'data_faturamento')::timestamptz, now());
    exception when others then raise exception 'Linha %: valor vendido inválido.', n;
    end;
    if valor is null or valor < 0 or valor::text in ('NaN','Infinity','-Infinity') or valor <> round(valor,2) then
      raise exception 'Linha %: o valor vendido deve ser positivo ou zero, com até duas casas decimais.', n;
    end if;
    select * into vend from public.vendedores
      where (lower(username) = usuario or lower(nome) = usuario) and role = 'vendedor'
        and ativo is true and excluido_em is null limit 1;
    if vend.id is null then raise exception 'Linha %: vendedor "%" não encontrado ou inativo.', n, usuario; end if;
    select * into cat from public.categorias where lower(nome) = lower(categoria) and ativa is true;
    if cat.id is null then raise exception 'Linha %: categoria "%" não cadastrada. Cadastre-a em Categorias.', n, categoria; end if;

    insert into public.vendas(vendedor_id, vendedor_nome, valor_vendido, categoria_nome, campanha_id, importacao_id, data_faturamento)
      values(vend.id, vend.nome, valor, cat.nome, camp.id, imp_id, data_fat);
    inseridas := inseridas + 1;
    total_valor := total_valor + valor;
    preview := preview || jsonb_build_array(jsonb_build_object(
      'linha', n, 'vendedor', vend.username, 'vendedor_nome', vend.nome,
      'categoria', cat.nome, 'valor_vendido', valor, 'data_faturamento', data_fat));
  end loop;

  update public.importacoes set total = n, inseridas = n, valor_total = round(total_valor,2), linhas = preview where id = imp_id;
  return jsonb_build_object('inseridas', inseridas, 'atualizadas', 0, 'total', n, 'auditoria_id', imp_id);
end $$;

-- ===================== ACOMPANHAMENTO =====================
create or replace function public.jj_resumo_campanha(p_token text, p_campanha_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode acompanhar resultados.'; end if;
  if not exists(select 1 from public.campanhas where id = p_campanha_id) then raise exception 'Campanha não encontrada.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.nome),'[]'::jsonb) from (
    select v.id, v.nome, v.username, v.ativo,
      (v.excluido_em is not null) as excluido,
      coalesce(a.total,0) as total_vendido,
      coalesce(a.itens,0) as itens,
      coalesce(a.ultima, '') as ultima_venda
    from public.vendedores v
    left join (
      select s.vendedor_id, round(sum(s.valor_vendido),2) as total, count(*) as itens,
        max((s.data_faturamento at time zone 'America/Sao_Paulo'))::date::text as ultima
      from public.vendas s where s.campanha_id = p_campanha_id and s.vendedor_id is not null
      group by s.vendedor_id
    ) a on a.vendedor_id = v.id
    where v.role = 'vendedor' and (v.excluido_em is null or a.vendedor_id is not null)
  ) x);
end $$;

create or replace function public.jj_evolucao_campanha(p_token text, p_campanha_id uuid, p_vendedor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; camp public.campanhas;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode acompanhar resultados.'; end if;
  select * into camp from public.campanhas where id = p_campanha_id;
  if camp.id is null then raise exception 'Campanha não encontrada.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.data),'[]'::jsonb) from (
    with dias as (
      select (s.data_faturamento at time zone 'America/Sao_Paulo')::date as dia, sum(s.valor_vendido) as valor
      from public.vendas s where s.campanha_id = p_campanha_id
        and (p_vendedor_id is null or s.vendedor_id = p_vendedor_id)
      group by 1
    ), soma as (
      select dia, sum(valor) as valor from (
        select camp.data_inicio as dia, 0::numeric as valor
        union all select d.dia, d.valor from dias d
      ) t group by dia
    )
    select dia as data, round(valor,2) as valor, round(sum(valor) over (order by dia),2) as acumulado from soma
  ) x);
end $$;

-- ===================== AUDITORIA =====================
create or replace function public.jj_auditoria_listar(p_token text, p_pagina integer default 1, p_busca text default '')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; tam integer := 10; total integer; registros jsonb;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode ver a auditoria.'; end if;
  p_busca := trim(coalesce(p_busca,''));
  select count(*) into total from public.importacoes i
    where p_busca = '' or strpos(lower(i.arquivo), lower(p_busca)) > 0 or strpos(lower(i.autor_nome), lower(p_busca)) > 0 or strpos(lower(i.autor_username), lower(p_busca)) > 0;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into registros from (
    select i.id, i.arquivo, i.autor_nome, i.autor_username, i.total, i.inseridas, i.valor_total,
      i.criado_em, i.desfeita_em, i.desfeita_por_nome,
      (i.desfeita_em is null and i.ordem = (select max(ordem) from public.importacoes)) as pode_desfazer
    from public.importacoes i
    where p_busca = '' or strpos(lower(i.arquivo), lower(p_busca)) > 0 or strpos(lower(i.autor_nome), lower(p_busca)) > 0 or strpos(lower(i.autor_username), lower(p_busca)) > 0
    order by i.criado_em desc limit tam offset greatest(0,(greatest(p_pagina,1)-1)*tam)
  ) x;
  return jsonb_build_object('registros', registros, 'pagina', greatest(p_pagina,1),
    'paginas', greatest(1, ceil(total::numeric/tam)), 'total', total);
end $$;

create or replace function public.jj_auditoria_detalhe(p_token text, p_id uuid, p_pagina integer default 1)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; imp public.importacoes; tam integer := 20; linhas jsonb; total integer;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode ver a auditoria.'; end if;
  select * into imp from public.importacoes where id = p_id;
  if imp.id is null then raise exception 'Importação não encontrada.'; end if;
  total := jsonb_array_length(imp.linhas);
  select coalesce(jsonb_agg(elem),'[]'::jsonb) into linhas from (
    select elem from jsonb_array_elements(imp.linhas) elem
    limit tam offset greatest(0,(greatest(p_pagina,1)-1)*tam)
  ) s;
  return jsonb_build_object(
    'importacao', jsonb_build_object('id', imp.id, 'arquivo', imp.arquivo, 'autor_nome', imp.autor_nome,
      'autor_username', imp.autor_username, 'total', imp.total, 'inseridas', imp.inseridas,
      'valor_total', imp.valor_total, 'criado_em', imp.criado_em, 'desfeita_em', imp.desfeita_em,
      'desfeita_por_nome', imp.desfeita_por_nome),
    'linhas', linhas, 'pagina', greatest(p_pagina,1), 'paginas', greatest(1, ceil(total::numeric/tam)));
end $$;

create or replace function public.jj_auditoria_desfazer(p_token text, p_id uuid, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u public.vendedores; imp public.importacoes; removidas integer;
begin
  u := jj_private.usuario(p_token);
  if u.role <> 'admin' then raise exception 'Somente a diretoria pode desfazer importações.'; end if;
  if p_confirmar is distinct from true then raise exception 'Confirme para desfazer a importação.'; end if;
  select * into imp from public.importacoes where id = p_id for update;
  if imp.id is null then raise exception 'Importação não encontrada.'; end if;
  if imp.desfeita_em is not null then raise exception 'Esta importação já foi desfeita.'; end if;
  if imp.ordem <> (select max(ordem) from public.importacoes) then raise exception 'Somente a última importação pode ser desfeita.'; end if;
  delete from public.vendas where importacao_id = p_id;
  get diagnostics removidas = row_count;
  update public.importacoes set desfeita_em = now(), desfeita_por_nome = u.nome where id = p_id;
  return jsonb_build_object('removidas', removidas, 'restauradas', 0);
end $$;

-- ===================== PERMISSÕES =====================
revoke all on all functions in schema jj_private from public, anon, authenticated;
revoke all on function public.jj_calcular_ranking() from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.jj_login(text,text), public.jj_logout(text), public.jj_bootstrap(text),
  public.jj_salvar(text,text,jsonb), public.jj_importar(text,jsonb), public.jj_resumo_campanha(text,uuid),
  public.jj_evolucao_campanha(text,uuid,uuid), public.jj_excluir_vendedor(text,uuid),
  public.jj_excluir_campanha(text,uuid,boolean), public.jj_excluir_categoria(text,uuid),
  public.jj_auditoria_listar(text,integer,text),
  public.jj_auditoria_detalhe(text,uuid,integer), public.jj_auditoria_desfazer(text,uuid,boolean)
  to anon, authenticated;

-- ===================== ADMIN INICIAL =====================
insert into public.vendedores (username, nome, senha, role, ativo)
values ('admin', 'CEO / Admin', crypt('123456', gen_salt('bf', 10)), 'admin', true)
on conflict (username) do update
  set nome = excluded.nome, senha = excluded.senha, role = 'admin', ativo = true, excluido_em = null;

notify pgrst, 'reload schema';
