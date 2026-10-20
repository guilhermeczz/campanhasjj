-- Campanhas JJ • Cadastro das 21 categorias da campanha
-- Rode este arquivo no SQL Editor do Supabase (pode rodar mais de uma vez).
-- As planilhas padronizadas usam exatamente estes nomes.

insert into public.categorias (nome, ativa) values
  ('WAGO', true),
  ('RAJIX', true),
  ('ENERBRAS', true),
  ('ILUMI', true),
  ('PHILIPHS', true),
  ('PILA', true),
  ('QUARTZOLIT', true),
  ('VOTORANTIM', true),
  ('SOPRANO', true),
  ('ADERE', true),
  ('MULTILIT', true),
  ('ALIANÇA', true),
  ('AMANCO', true),
  ('ATCO', true),
  ('ATLAS', true),
  ('CORTAG', true),
  ('IRWIN', true),
  ('LIXAFLEX', true),
  ('MG', true),
  ('TEKBOND', true),
  ('ZAGONEL', true)
on conflict (nome) do update set ativa = true;

-- Conferência: deve retornar 21 linhas.
select nome, ativa from public.categorias order by nome;
