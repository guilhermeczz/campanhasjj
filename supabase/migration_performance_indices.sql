-- Campanhas JJ: Migração de Performance de Índices
-- Objetivo: Otimizar o cálculo do ranking e a listagem de vendas no painel admin.
-- Esta migração é segura, não altera dados, apenas adiciona índices para acelerar leituras.

begin;

-- Otimiza o JOIN baseado em range de datas usado no jj_calcular_ranking
create index if not exists idx_vendas_data_faturamento 
on public.vendas(data_faturamento);

-- Otimiza a ordenação no jj_bootstrap usada pelo admin para carregar vendas
create index if not exists idx_vendas_bootstrap_order 
on public.vendas(data_faturamento desc, id);

-- Analisa a tabela após criar os índices para o otimizador do PostgreSQL (planner)
analyze public.vendas;

commit;
