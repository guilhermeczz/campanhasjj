# Agente de Memória: Campanhas JJ

Este arquivo centraliza a arquitetura, serviços, testes e pendências. Deve ser lido em toda inicialização.

## 1. Memórias Arquiteturais
- **Backend:** Supabase PostgreSQL com lógica centralizada em RPCs (PL/pgSQL). Fonte única: `supabase/schema.sql` (as antigas `migration_*.sql` foram removidas).
- **Frontend:** Next.js (App Router), focado em interface, com cálculos delegados ao banco.
- **Segurança:** Baseada em RLS e verificação de sessão (`jj_session`) dentro das RPCs. Chaves `NEXT_PUBLIC_` são padrão; segurança reside no banco.
- **Modelo de negócio:** ranking **por categoria** (cada venda soma no ranking da sua categoria; **não existe ranking geral**, nem por vendedor nem para a diretoria). Planilha de 3 colunas: `Vendedor`, `Valor Vendido`, `Categoria`. Uso previsto até 31/12/2026.
- **Performance:** Cálculos pesados (ranking, resumo, evolução) ocorrem no SQL. Escala por indexação conforme volume.

## 2. Serviços Principais (RPCs, todas em schema.sql)
- `jj_login` / `jj_logout`: sessão em cookie `jj_session`.
- `jj_bootstrap` (v4): leve — `vendas: []` sempre + `vendas_total` (admin). Limite de campanha: `data_faturamento < 01/01/2027` (31/12/2026 inclusive, fuso SP).
- `jj_salvar`: cadastros (`campanhas`, `categorias`, `vendedores`).
- `jj_excluir_vendedor` / `jj_excluir_campanha` / `jj_excluir_categoria`: exclusão com preservação de histórico.
- `jj_importar`: importação atômica de vendas (inserção) com campanha escolhida no upload.
- `jj_resumo_campanha`: agregado por vendedor de UMA campanha (valor, itens, última venda; inclui zerados e excluídos com histórico).
- `jj_evolucao_campanha`: evolução diária acumulada de UMA campanha, opcional por vendedor.
- `jj_calcular_ranking`: motor do ranking **por categoria** (`partition by campanha_id, categoria_nome`; prêmios 1º/2º/3º por categoria; empate → posição compartilhada e `valor_premio` nulo). O `jj_bootstrap` do vendedor devolve só `{campanha_id, categoria_nome, vendedor_id, posicao}`.
- `jj_auditoria_listar` / `jj_auditoria_detalhe` / `jj_auditoria_desfazer`: auditoria e reversão transacional da última importação (`importacoes.ordem bigserial`; desfazer só a última, uma vez).

## 3. Rotas
- `/api/data`, `/api/session`, `/api/importar`, `/api/cadastros`, `/api/categorias` (DELETE → `jj_excluir_categoria`), `/api/campanhas`, `/api/vendedores`, `/api/resumo`, `/api/evolucao`, `/api/auditoria`.

## 4. Testes
- **Status:** 50 testes aprovados (`npm test`), `npm run typecheck` e `npm run build` limpos.
- **Cobertura:** importação, regras de negócio, ranking por categoria (independente por categoria), resumo/evolução, auditoria/desfazer, exclusões, privacidade, bootstrap leve e cenários de segurança.
- **Ferramentas:** PGlite (memória, contrib `pgcrypto`) para testes rápidos sem afetar o Supabase real.

## 5. Pendências e Preocupações (Backlog)
1. **Supabase prod:** aplicar `supabase/schema.sql` no SQL Editor (recria o modelo com ranking por categoria) + `supabase/seed_copa_campeoes.sql` (1 campanha + 21 categorias) + push para a Vercel rebuildar.
2. **Escala:** teste de volume com massa sintética (10k/50k/100k vendas).
3. **Publicação:** deploy na Vercel (a cargo do usuário).
4. **Revisão Visual:** inspeção UI pós-deploy.
5. **Docs:** `README.md`, `STATUS.md`, `HANDOFF_CODEX.md` e `ENTREGA.md` já atualizados para o modelo de valor vendido + categorias (ranking por categoria).

## 6. Comandos Úteis
- `npm run dev`: Sobe o servidor local fixo em `http://127.0.0.1:3000` (use esse endereço, não `localhost`).
- `npm run dev:limpo`: Limpa o cache `.next-dev` e reinicia o dev.
- `npm test`: Executa a suíte de testes (PGlite).
- `npm run typecheck` / `npm run build`: Verificações de tipo e de produção.
- `npm run check:supabase`: Diagnóstico de tabelas e funções do banco.

---
*Data da última atualização: 18/10/2026*
