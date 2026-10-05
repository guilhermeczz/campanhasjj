-- Aplicar depois da última migration_backend_seguro.sql. Pode ser reaplicado.
-- Guarda somente importações concluídas. Erro desfaz vendas e auditoria juntos.
begin;

create table if not exists jj_private.importacao_previas (
  hash text primary key,
  dados jsonb not null,
  bytes_dados bigint not null default 0,
  criado_em timestamptz not null default now()
);
create table if not exists jj_private.importacoes_vendas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  autor_id uuid references public.vendedores(id) on delete set null,
  autor_nome text not null,
  autor_usuario text not null,
  arquivo text not null,
  total integer not null,
  inseridas integer not null,
  atualizadas integer not null,
  valor_liquido numeric not null,
  total_pontos numeric not null,
  previa_hash text not null references jj_private.importacao_previas(hash)
);
create index if not exists jj_importacoes_ordem on jj_private.importacoes_vendas(criado_em desc,id desc);
alter table jj_private.importacoes_vendas add column if not exists desfeita_em timestamptz;
alter table jj_private.importacoes_vendas add column if not exists desfeita_por_nome text;
alter table jj_private.importacoes_vendas add column if not exists desfeita_por_usuario text;
-- Uma única reserva de restauração: substituída pela próxima importação concluída.
create table if not exists jj_private.importacao_desfazer (
  unica boolean primary key default true check (unica),
  importacao_id uuid not null references jj_private.importacoes_vendas(id),
  anteriores jsonb not null,
  hash_atual text not null
);
alter table jj_private.importacao_desfazer enable row level security;
alter table jj_private.importacao_desfazer add column if not exists contexto_hash text;
revoke all on jj_private.importacao_desfazer from public,anon,authenticated;
alter table jj_private.importacao_previas enable row level security;
alter table jj_private.importacoes_vendas enable row level security;
revoke all on jj_private.importacao_previas,jj_private.importacoes_vendas from public,anon,authenticated;

-- Conserva a implementação validada de importação em função privada.
-- Ao reaplicar o backend e depois este arquivo, atualiza a implementação privada.
do $migration$
declare definicao text;
begin
  if to_regprocedure('public.jj_importar(text,jsonb)') is null then
    raise exception 'Aplique migration_backend_seguro.sql antes da auditoria.';
  end if;
  select pg_get_functiondef('public.jj_importar(text,jsonb)'::regprocedure) into definicao;
  if position('jj_importar_com_auditoria' in definicao)=0 then
    execute replace(definicao,'FUNCTION public.jj_importar(','FUNCTION jj_private.importar_vendas(');
  end if;
  if to_regprocedure('jj_private.importar_vendas(text,jsonb)') is null then
    raise exception 'Não foi possível preparar a importação privada.';
  end if;
end $migration$;
revoke all on function jj_private.importar_vendas(text,jsonb) from public,anon,authenticated;

-- Protege também o produto anterior de um item que mudou de produto no reenvio.
create or replace function jj_private.contexto_importacao(p_anteriores jsonb,p_itens text[])
returns text language sql set search_path=pg_catalog as $$
  with envolvidos as (
    select v.produto_id,v.marca_id,v.campanha_id from public.vendas v where v.item_id=any(p_itens)
    union select v.produto_id,v.marca_id,v.campanha_id from jsonb_populate_recordset(null::public.vendas,p_anteriores) v
  )
  select encode(sha256(convert_to(jsonb_build_object(
    'produtos',(select jsonb_agg(to_jsonb(p) order by p.id) from public.produtos p where p.id in (select produto_id from envolvidos)),
    'campanhas',(select jsonb_agg(to_jsonb(c) order by c.id) from public.campanhas c where c.marca_id in (select marca_id from envolvidos) or c.id in (select campanha_id from envolvidos))
  )::text,'UTF8')),'hex');
$$;
revoke all on function jj_private.contexto_importacao(jsonb,text[]) from public,anon,authenticated;

create or replace function public.jj_importar_com_auditoria(p_token text,p_linhas jsonb,p_arquivo text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; resultado jsonb; previa jsonb; chave text; log_id uuid;
  nome_arquivo text; liquido numeric; pontos numeric; anteriores jsonb; hash_atual text; itens text[];
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode importar vendas e registrar auditoria.'; end if;
  nome_arquivo:=regexp_replace(trim(coalesce(p_arquivo,'Importação via integração')),'[[:cntrl:]]','','g');
  if nome_arquivo='' or length(nome_arquivo)>255 then raise exception 'Nome do arquivo deve ter entre 1 e 255 caracteres.'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 5000 then
    raise exception 'Envie entre 1 e 5.000 vendas.';
  end if;
  perform pg_advisory_xact_lock(7482026);
  perform pg_advisory_xact_lock(7482028);
  perform pg_advisory_xact_lock(7482027);
  lock table public.vendas in share row exclusive mode;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.item_id),'[]'::jsonb) into anteriores
    from public.vendas v where v.item_id in (select trim(x->>'item_id') from jsonb_array_elements(p_linhas) x);
  -- A validação/gravação original mantém os locks até terminar esta transação.
  resultado:=jj_private.importar_vendas(p_token,p_linhas);
  -- Arrays compactos: nomes das colunas são gravados uma vez, não a cada linha.
  select jsonb_build_object('versao',1,'colunas',jsonb_build_array(
      'linha','item_id','vendedor','produto','quantidade','marca_id','data_faturamento',
      'valor_bruto','valor_devolucao','valor_cancelamento','cliente_id','status','pontos',
      'pontos_por_real','valor_por_ponto','marca_nome','vendedor_nome','campanha','produto_nome'),
    'linhas',jsonb_agg(jsonb_build_array(
      case when (x.linha->>'linha_planilha') ~ '^[0-9]{1,4}$'
        then case when (x.linha->>'linha_planilha')::integer between 2 and 5001
          then (x.linha->>'linha_planilha')::integer else x.ordem+1 end else x.ordem+1 end,
      v.item_id,v.vendedor,trim(x.linha->>'produto'),v.quantidade,v.marca_id,v.data_faturamento,
      v.valor_bruto,v.valor_devolucao,v.valor_cancelamento,v.cliente_id,v.status,v.pontos,
      v.pontos_por_real,v.valor_por_ponto,v.marca_nome,ven.nome,v.campanha,v.produto) order by x.ordem)),
    coalesce(sum(case when v.status='faturado' then v.valor_bruto-v.valor_devolucao-v.valor_cancelamento else 0 end),0),
    coalesce(sum(v.pontos),0)
    into previa,liquido,pontos
  from jsonb_array_elements(p_linhas) with ordinality x(linha,ordem)
  join public.vendas v on v.item_id=trim(x.linha->>'item_id')
  join public.vendedores ven on ven.id=v.vendedor_id;
  chave:=encode(sha256(convert_to(previa::text,'UTF8')),'hex');
  insert into jj_private.importacao_previas(hash,dados) values(chave,previa) on conflict(hash) do nothing;
  if exists(select 1 from jj_private.importacao_previas s where s.hash=chave and s.dados<>previa) then
    raise exception 'Não foi possível verificar a integridade da prévia.';
  end if;
  update jj_private.importacao_previas s set bytes_dados=pg_column_size(s.dados) where s.hash=chave and s.bytes_dados=0;
  insert into jj_private.importacoes_vendas(criado_em,autor_id,autor_nome,autor_usuario,arquivo,total,inseridas,atualizadas,valor_liquido,total_pontos,previa_hash)
    values(clock_timestamp(),u.id,u.nome,u.username,nome_arquivo,(resultado->>'total')::integer,(resultado->>'inseridas')::integer,
      (resultado->>'atualizadas')::integer,liquido,pontos,chave) returning id into log_id;
  select encode(sha256(convert_to(jsonb_agg(to_jsonb(v) order by v.item_id)::text,'UTF8')),'hex') into hash_atual
    from public.vendas v where v.item_id in (select trim(x->>'item_id') from jsonb_array_elements(p_linhas) x);
  select array_agg(trim(x->>'item_id')) into itens from jsonb_array_elements(p_linhas) x;
  insert into jj_private.importacao_desfazer(unica,importacao_id,anteriores,hash_atual,contexto_hash)
    values(true,log_id,anteriores,hash_atual,jj_private.contexto_importacao(anteriores,itens))
    on conflict(unica) do update set importacao_id=excluded.importacao_id,anteriores=excluded.anteriores,
      hash_atual=excluded.hash_atual,contexto_hash=excluded.contexto_hash;
  return resultado||jsonb_build_object('auditoria_id',log_id);
end $$;

create or replace function public.jj_auditoria_desfazer(p_token text,p_id uuid,p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; reserva jj_private.importacao_desfazer; registro jj_private.importacoes_vendas;
  itens text[]; hash_atual text;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode desfazer importações.'; end if;
  if p_confirmar is distinct from true then raise exception 'Confirme a ação para desfazer a importação.'; end if;
  perform pg_advisory_xact_lock(7482026);
  perform pg_advisory_xact_lock(7482028);
  perform pg_advisory_xact_lock(7482027);
  lock table public.vendas in share row exclusive mode;
  select * into reserva from jj_private.importacao_desfazer where unica and importacao_id=p_id;
  if reserva.importacao_id is null then raise exception 'Somente a última importação pode ser desfeita, uma única vez. Atualize o histórico.'; end if;
  select * into registro from jj_private.importacoes_vendas where id=p_id;
  select array_agg(x->>1) into itens from jj_private.importacao_previas s,
    lateral jsonb_array_elements(s.dados->'linhas') x where s.hash=registro.previa_hash;
  select encode(sha256(convert_to(jsonb_agg(to_jsonb(v) order by v.item_id)::text,'UTF8')),'hex') into hash_atual
    from public.vendas v where v.item_id=any(itens);
  if hash_atual is distinct from reserva.hash_atual or jj_private.contexto_importacao(reserva.anteriores,itens) is distinct from reserva.contexto_hash then
    raise exception 'As vendas ou suas regras foram alteradas após a importação, por exemplo por uma edição de produto ou campanha. Importe uma planilha corrigida para preservar as alterações posteriores.';
  end if;
  -- IDs e datas originais são preservados. A transação só conclui se tudo for restaurado.
  delete from public.vendas where item_id=any(itens);
  insert into public.vendas select * from jsonb_populate_recordset(null::public.vendas,reserva.anteriores);
  update jj_private.importacoes_vendas set desfeita_em=clock_timestamp(),desfeita_por_nome=u.nome,desfeita_por_usuario=u.username where id=p_id;
  delete from jj_private.importacao_desfazer where unica;
  return jsonb_build_object('ok',true,'removidas',registro.inseridas,'restauradas',registro.atualizadas);
end $$;

-- Mantém compatibilidade da RPC antiga sem permitir importação sem auditoria.
create or replace function public.jj_importar(p_token text,p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  return public.jj_importar_com_auditoria(p_token,p_linhas,null)-'auditoria_id';
end $$;

create or replace function public.jj_auditoria_listar(p_token text,p_pagina integer default 1,p_busca text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; total bigint; registros jsonb; busca text:=lower(trim(coalesce(p_busca,'')));
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode consultar a auditoria.'; end if;
  if p_pagina is null or p_pagina<1 or p_pagina>1000000 or length(busca)>120 then raise exception 'Filtro de auditoria inválido.'; end if;
  select count(*) into total from jj_private.importacoes_vendas l
    where busca='' or position(busca in lower(l.arquivo||' '||l.autor_nome||' '||l.autor_usuario))>0;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.criado_em desc,r.id desc),'[]'::jsonb) into registros from (
    select l.id,l.criado_em,l.autor_nome,l.autor_usuario,l.arquivo,l.total,l.inseridas,l.atualizadas,l.valor_liquido,l.total_pontos,
      l.desfeita_em,l.desfeita_por_nome,l.desfeita_por_usuario,
      exists(select 1 from jj_private.importacao_desfazer d where d.importacao_id=l.id) as pode_desfazer
    from jj_private.importacoes_vendas l
    where busca='' or position(busca in lower(l.arquivo||' '||l.autor_nome||' '||l.autor_usuario))>0
    order by l.criado_em desc,l.id desc limit 20 offset (p_pagina-1)*20
  ) r;
  return jsonb_build_object('registros',registros,'pagina',p_pagina,'total',total,'paginas',greatest(1,ceil(total/20.0)),
    'previas_unicas',(select count(*) from jj_private.importacao_previas),
    'bytes_previas',(select coalesce(sum(bytes_dados),0) from jj_private.importacao_previas),
    'bytes_restauracao',(select coalesce(sum(pg_column_size(anteriores)),0) from jj_private.importacao_desfazer));
end $$;

create or replace function public.jj_auditoria_detalhe(p_token text,p_id uuid,p_pagina integer default 1)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u public.vendedores; registro jj_private.importacoes_vendas; documento jsonb; pagina jsonb;
begin
  u:=jj_private.usuario(p_token);
  if u.role<>'admin' then raise exception 'Somente a diretoria pode consultar a auditoria.'; end if;
  if p_pagina is null or p_pagina<1 or p_pagina>50 then raise exception 'Página da prévia inválida.'; end if;
  select * into registro from jj_private.importacoes_vendas where id=p_id;
  if registro.id is null then raise exception 'Importação não encontrada.'; end if;
  select s.dados into documento from jj_private.importacao_previas s where s.hash=registro.previa_hash;
  select coalesce(jsonb_agg(linha order by ordem),'[]'::jsonb) into pagina from (
    select x.linha,x.ordem from jsonb_array_elements(documento->'linhas') with ordinality x(linha,ordem)
    order by ordem limit 100 offset (p_pagina-1)*100
  ) r;
  return jsonb_build_object('importacao',(to_jsonb(registro)-'previa_hash'-'autor_id')||jsonb_build_object(
      'pode_desfazer',exists(select 1 from jj_private.importacao_desfazer d where d.importacao_id=p_id)),'colunas',documento->'colunas',
    'linhas',pagina,'pagina',p_pagina,'paginas',greatest(1,ceil(registro.total/100.0)));
end $$;

revoke all on function public.jj_auditoria_desfazer(text,uuid,boolean),public.jj_importar(text,jsonb),public.jj_importar_com_auditoria(text,jsonb,text),
  public.jj_auditoria_listar(text,integer,text),public.jj_auditoria_detalhe(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.jj_auditoria_desfazer(text,uuid,boolean),public.jj_importar(text,jsonb),public.jj_importar_com_auditoria(text,jsonb,text),
  public.jj_auditoria_listar(text,integer,text),public.jj_auditoria_detalhe(text,uuid,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
