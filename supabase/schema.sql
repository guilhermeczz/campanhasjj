-- Campanhas JJ • Schema Supabase
-- Rode no SQL Editor do Supabase

create table if not exists vendedores (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  nome text not null,
  senha text not null,
  role text not null default 'vendedor' check (role in ('admin','vendedor')),
  ativo boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  descricao text default '',
  data_inicio date,
  data_fim date,
  ativa boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists marcas (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  created_at timestamp with time zone default now()
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid references marcas(id) on delete cascade,
  marca_nome text not null default '',
  nome text not null,
  pontos_por_unidade integer not null default 1,
  created_at timestamp with time zone default now()
);

create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  vendedor text not null,
  quantidade numeric not null check (quantidade > 0),
  produto text not null,
  campanha text not null,
  pontos integer not null default 0,
  created_at timestamp with time zone default now()
);

create index if not exists idx_vendas_vendedor on vendas(vendedor);
create index if not exists idx_vendas_campanha on vendas(campanha);
create index if not exists idx_produtos_nome on produtos(nome);

alter table vendedores enable row level security;
alter table campanhas enable row level security;
alter table marcas enable row level security;
alter table produtos enable row level security;
alter table vendas enable row level security;

drop policy if exists "public all vendedores" on vendedores;
drop policy if exists "public all campanhas" on campanhas;
drop policy if exists "public all marcas" on marcas;
drop policy if exists "public all produtos" on produtos;
drop policy if exists "public all vendas" on vendas;

create policy "public all vendedores" on vendedores for all using (true) with check (true);
create policy "public all campanhas" on campanhas for all using (true) with check (true);
create policy "public all marcas" on marcas for all using (true) with check (true);
create policy "public all produtos" on produtos for all using (true) with check (true);
create policy "public all vendas" on vendas for all using (true) with check (true);

insert into vendedores (username, nome, senha, role) values
  ('admin', 'CEO / Admin', '123456', 'admin'),
  ('joao.silva', 'João Silva', '111111', 'vendedor'),
  ('maria.souza', 'Maria Souza', '222222', 'vendedor')
on conflict (username) do nothing;

insert into campanhas (nome, descricao, data_inicio, data_fim, ativa) values
  ('Campanha Natal', 'Quem vender mais ganha presente no fim do ano.', '2026-10-01', '2026-12-31', true),
  ('Campanha Black Friday', 'Foco em giro rápido de estoque.', '2026-11-01', '2026-11-30', true)
on conflict (nome) do nothing;

insert into marcas (nome) values ('Amanco'), ('Tigre'), ('Deca')
on conflict (nome) do nothing;

-- Produtos com peso (exemplo: Tubos Amanco = 1, Conexões Amanco = 3)
insert into produtos (marca_id, marca_nome, nome, pontos_por_unidade)
select m.id, m.nome, x.nome, x.pontos
from (values
  ('Amanco', 'Tubos Amanco', 1),
  ('Amanco', 'Conexões Amanco', 3),
  ('Tigre', 'Tubos Tigre', 1),
  ('Tigre', 'Conexões Tigre', 2),
  ('Deca', 'Torneiras Deca', 5)
) as x(marca, nome, pontos)
join marcas m on m.nome = x.marca
on conflict do nothing;
