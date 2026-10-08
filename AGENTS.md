# Agente de Memória: Campanhas JJ

Este arquivo centraliza a arquitetura, serviços, testes e pendências. Deve ser lido em toda inicialização.

## 1. Memórias Arquiteturais
- **Backend:** Supabase PostgreSQL com lógica centralizada em RPCs (PL/pgSQL).
- **Frontend:** Next.js (App Router), focado em interface, com cálculos delegados ao banco.
- **Segurança:** Baseada em RLS e verificação de sessão (`jj_session`) dentro das RPCs. Chaves `NEXT_PUBLIC_` são padrão; segurança reside no banco.
- **Performance:** Cálculos pesados (ranking, pontos) ocorrem no SQL. Estratégia de escalabilidade: indexação agressiva no banco conforme o volume crescer.

## 2. Serviços Principais (RPCs)
- `supabase/migration_performance_indices.sql`: Índices para performance de ranking e listagem de vendas.
- `jj_bootstrap`: Inicialização de sessão e dados básicos.
- `jj_importar_com_auditoria`: Importação de vendas com log.
- `jj_calcular_ranking`: Motor de cálculo do ranking (SQL).
- `jj_auditoria_desfazer`: Reversão transacional da última importação.
- `jj_excluir_produto`/`jj_excluir_vendedor`: Gerenciamento de cadastros com preservação de histórico.

## 3. Testes
- **Status:** 91 testes aprovados (`npm test`).
- **Cobertura:** Cobrem importação, regras de negócio, cálculo de pontos, exclusão, privacidade e cenários de segurança.
- **Ferramentas:** PGlite (memória) para testes rápidos sem afetar o Supabase real.

## 4. Pendências e Preocupações (Backlog)
1.  **Segurança/Performance:** Auditoria de índices nas tabelas `vendas` e `produtos` para garantir performance conforme a base cresce.
2.  **Funcionalidade:** Ranking por pontos implementado e disponível para consulta na diretoria.
3.  **Publicação:** Validação final e deploy na Vercel (a cargo do usuário).
4.  **Revisão Visual:** Inspeção UI pós-deploy.

## 5. Comandos Úteis
- `npm run dev`: Sobe o servidor local fixo em `http://127.0.0.1:3000` (use esse endereço, não `localhost`).
- `npm run dev:limpo`: Limpa o cache `.next-dev` e reinicia o dev (use se o dev travar ou a porta ficar presa).
- `npm test`: Executa a suíte de testes (PGlite).
- `npm run build`: Verifica a compilação de produção.
- `npm run check:supabase`: Diagnóstico de funções do banco.
- `node scripts/check-products-file.mjs "caminho.xlsx"`: Valida o arquivo real em banco temporário.

---
*Data da última atualização: 08/10/2026*
