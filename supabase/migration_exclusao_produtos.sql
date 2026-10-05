-- Exclusão de produtos: aplicar após o backend seguro. Pode ser reaplicada.
-- Preserva vendas, pontos, auditoria e a RPC pública de importação com auditoria.
-- Gerado por scripts/build-products-migration.mjs a partir do backend canônico.
begin;
alter table public.produtos add column if not exists excluido_em timestamptz;

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
    -- O vendedor recebe somente sua posição por campanha. Pontos, vendas e faturamento ficam com a diretoria.
    'vendas',(select case when u.role='admin' then (select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('marca',m.nome,'marca_nome',m.nome,'vendedor_nome',vend.nome,'campanha',coalesce(c.nome,v.campanha)) order by v.data_faturamento desc,v.id),'[]'::jsonb)
      from public.vendas v left join public.marcas m on m.id=v.marca_id
      left join public.vendedores vend on vend.id=v.vendedor_id left join public.campanhas c on c.id=v.campanha_id)
      else '[]'::jsonb end),
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

create or replace function jj_private.importar_vendas(p_token text,p_linhas jsonb)
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
grant execute on function public.jj_bootstrap(text),public.jj_salvar(text,text,jsonb),public.jj_importar_produtos(text,jsonb),
  public.jj_excluir_produto(text,uuid,boolean),public.jj_importar(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
