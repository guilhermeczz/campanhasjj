-- COPA DOS CAMPEÕES CONSTRUTOTA • Migração
-- Rode no SQL Editor do Supabase APÓS o schema.sql
-- Não apaga nada: só adiciona colunas/tabelas novas.

-- 1) Campanhas: tipo + prêmios do TOP 3
alter table campanhas add column if not exists tipo text default 'pontos';
alter table campanhas add column if not exists premio_1 numeric default 2000;
alter table campanhas add column if not exists premio_2 numeric default 1500;
alter table campanhas add column if not exists premio_3 numeric default 500;

-- 2) Marcas: ID/código configurável + ativa
alter table marcas add column if not exists codigo_externo text;
alter table marcas add column if not exists ativa boolean default true;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marcas_codigo_externo_unique') then
    alter table marcas add constraint marcas_codigo_externo_unique unique (codigo_externo);
  end if;
end $$;

-- 3) Produtos: código configurável
alter table produtos add column if not exists codigo_externo text;

-- 4) Vendas: campos de faturamento da Copa (todos anuláveis p/ compatibilidade)
alter table vendas add column if not exists data_faturamento timestamp with time zone;
alter table vendas add column if not exists valor_bruto numeric default 0;
alter table vendas add column if not exists valor_devolucao numeric default 0;
alter table vendas add column if not exists valor_cancelamento numeric default 0;
alter table vendas add column if not exists cliente_id text;
alter table vendas add column if not exists cliente_nome text;
alter table vendas add column if not exists marca_id uuid references marcas(id);
alter table vendas add column if not exists marca_nome text;
alter table vendas add column if not exists status text default 'faturado';

create index if not exists idx_vendas_data_fat on vendas(data_faturamento);
create index if not exists idx_vendas_marca_id on vendas(marca_id);
create index if not exists idx_vendas_cliente on vendas(cliente_id);

-- 5) Vínculo campanha x marcas participantes
create table if not exists campanha_marcas (
  campanha_id uuid references campanhas(id) on delete cascade,
  marca_id uuid references marcas(id) on delete cascade,
  primary key (campanha_id, marca_id)
);
alter table campanha_marcas enable row level security;
drop policy if exists "public all campanha_marcas" on campanha_marcas;
create policy "public all campanha_marcas" on campanha_marcas for all using (true) with check (true);

-- 6) Campanha COPA DOS CAMPEÕES CONSTRUTOTA (01/10/2026 a 31/12/2026)
insert into campanhas (nome, descricao, data_inicio, data_fim, ativa, tipo, premio_1, premio_2, premio_3)
values (
  'COPA DOS CAMPEÕES CONSTRUTOTA',
  'Ranking por marca pelo faturamento líquido faturado entre 01/10/2026 e 31/12/2026. Top 3 por marca premiado.',
  '2026-10-01', '2026-12-31', true, 'faturamento_marca', 2000, 1500, 500
)
on conflict (nome) do update set
  data_inicio = excluded.data_inicio,
  data_fim = excluded.data_fim,
  ativa = true,
  tipo = 'faturamento_marca',
  premio_1 = 2000, premio_2 = 1500, premio_3 = 500;

-- 7) Marcas participantes (IDs configuráveis)
insert into marcas (nome, codigo_externo) values
  ('WAGO', 'WAGO'), ('Raiix', 'RAIIX'), ('Enerbras', 'ENERBRAS'),
  ('iLUMI', 'ILUMI'), ('Philips', 'PHILIPS'), ('PILA', 'PILA'),
  ('Quartzolit', 'QUARTZOLIT'), ('Votorantim Cimentos', 'VOTORANTIM'),
  ('Soprano', 'SOPRANO'), ('Adere', 'ADERE'), ('Multilit', 'MULTILIT'),
  ('Aliança', 'ALIANCA'), ('Amanco Wavin', 'AMANCO-WAVIN'), ('ATCO', 'ATCO'),
  ('Atlas', 'ATLAS'), ('Cortag', 'CORTAG'), ('Irwin', 'IRWIN'),
  ('Lixa Flex', 'LIXA-FLEX'), ('MG MarGirius', 'MARGIRIUS'),
  ('Tekbond', 'TEKBOND'), ('Zagonel', 'ZAGONEL')
on conflict (nome) do update set codigo_externo = excluded.codigo_externo;

-- 8) Vincula as 21 marcas à Copa
insert into campanha_marcas (campanha_id, marca_id)
select c.id, m.id
from campanhas c
join marcas m on m.nome in (
  'WAGO','Raiix','Enerbras','iLUMI','Philips','PILA','Quartzolit',
  'Votorantim Cimentos','Soprano','Adere','Multilit','Aliança',
  'Amanco Wavin','ATCO','Atlas','Cortag','Irwin','Lixa Flex',
  'MG MarGirius','Tekbond','Zagonel'
)
where c.nome = 'COPA DOS CAMPEÕES CONSTRUTOTA'
on conflict do nothing;
