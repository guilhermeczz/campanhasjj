-- COPA • Migração v2: cada marca é uma campanha
-- Rode no SQL Editor do Supabase APÓS migration_copa.sql
-- 1) Preenche ID das marcas antigas (Amanco, Tigre, Deca)
-- 2) Vincula campanha <-> marca (1:1)
-- 3) Cria 1 campanha por marca participante (01/10/2026 a 31/12/2026)

-- 1) Backfill de IDs faltantes
update marcas
set codigo_externo = upper(regexp_replace(nome, '[^A-Za-z0-9]+', '-', 'g'))
where codigo_externo is null or codigo_externo = '';

-- 2) Campanha vinculada a uma marca
alter table campanhas add column if not exists marca_id uuid references marcas(id);
create index if not exists idx_campanhas_marca on campanhas(marca_id);

-- 3) Uma campanha por marca participante (nome = nome da marca)
insert into campanhas (nome, descricao, data_inicio, data_fim, ativa, tipo, premio_1, premio_2, premio_3, marca_id)
select
  m.nome,
  'Ranking da marca ' || m.nome || ' pelo faturamento líquido faturado entre 01/10/2026 e 31/12/2026. Top 3 premiado.',
  '2026-10-01', '2026-12-31', true,
  'faturamento_marca', 2000, 1500, 500,
  m.id
from marcas m
where m.nome in (
  'WAGO','Raiix','Enerbras','iLUMI','Philips','PILA','Quartzolit',
  'Votorantim Cimentos','Soprano','Adere','Multilit','Aliança',
  'Amanco Wavin','ATCO','Atlas','Cortag','Irwin','Lixa Flex',
  'MG MarGirius','Tekbond','Zagonel'
)
on conflict (nome) do update set
  tipo = 'faturamento_marca',
  marca_id = excluded.marca_id,
  ativa = true;

-- 4) Vínculo 1:1 em campanha_marcas
insert into campanha_marcas (campanha_id, marca_id)
select c.id, c.marca_id
from campanhas c
where c.marca_id is not null
on conflict do nothing;
