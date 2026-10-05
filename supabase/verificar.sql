-- Campanhas JJ • Verificação do banco
-- Rode após o schema.sql para confirmar que está tudo certo.
-- Resultado esperado: 5 tabelas, 3 vendedores, 2 campanhas, 3+ marcas, 5 produtos.

-- 1) Tabelas existentes
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('vendedores','campanhas','marcas','produtos','vendas')
order by table_name;

-- 2) Contagem de registros
select 'vendedores' as tabela, count(*) as total from vendedores
union all
select 'campanhas', count(*) from campanhas
union all
select 'marcas', count(*) from marcas
union all
select 'produtos', count(*) from produtos
union all
select 'vendas', count(*) from vendas;

-- 3) Pesos cadastrados (conferir regra Amanco)
select marca_nome, nome, pontos_por_unidade
from produtos
order by marca_nome, pontos_por_unidade;
