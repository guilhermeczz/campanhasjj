-- Campanhas JJ • Configuração da campanha e das marcas (categorias)
-- Rode este arquivo no SQL Editor do Supabase DEPOIS do supabase/schema.sql.
-- Pode ser executado mais de uma vez sem duplicar (idempotente).
-- Neste modelo, cada MARCA participante é cadastrada como uma CATEGORIA.

-- ===================== CAMPANHA =====================
insert into public.campanhas (nome, descricao, data_inicio, data_fim, ativa, premio_1, premio_2, premio_3)
values (
  'COPA DOS CAMPEÕES CONSTRUTOTA',
  'Ranking por valor vendido. Período: 01/10/2026 a 31/12/2026.',
  '2026-10-01',
  '2026-12-31',
  true,
  2000,
  1500,
  500
)
on conflict (nome) do update
  set descricao  = excluded.descricao,
      data_inicio = excluded.data_inicio,
      data_fim    = excluded.data_fim,
      ativa       = true,
      premio_1    = excluded.premio_1,
      premio_2    = excluded.premio_2,
      premio_3    = excluded.premio_3;

-- ===================== MARCAS PARTICIPANTES (CATEGORIAS) =====================
insert into public.categorias (nome, ativa) values
  ('WAGO', true),
  ('Raiix', true),
  ('Enerbras', true),
  ('iLUMI', true),
  ('Philips', true),
  ('PILA', true),
  ('Quartzolit', true),
  ('Votorantim Cimentos', true),
  ('Soprano', true),
  ('Adere', true),
  ('Multilit', true),
  ('Aliança', true),
  ('Amanco Wavin', true),
  ('ATCO', true),
  ('Atlas', true),
  ('Cortag', true),
  ('Irwin', true),
  ('Lixa Flex', true),
  ('MG MarGirius', true),
  ('Tekbond', true),
  ('Zagonel', true)
on conflict (nome) do update set ativa = true;
