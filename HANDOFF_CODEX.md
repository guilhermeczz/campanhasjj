# Handoff — Campanhas JJ (para próxima IA / Codex)

Data: 2026-10-18. Projeto: `C:\campanha-jj`. Repo remoto: `https://github.com/guilhermeczz/campanhasjj`.

## 1. Estado do Git

- Branch `main`, `origin` = `https://github.com/guilhermeczz/campanhasjj.git`.
- O projeto foi migrado nesta sessão do modelo antigo (produtos + pontos) para **ranking por valor vendido + categorias**. Há muitas alterações pendentes (arquivos modificados, removidos e novos) ainda **sem commit**, conforme decidido pelo usuário.
- Não commitar `.env.local`, `.next/`, `.next-dev/`, `node_modules/` (ver `.gitignore`).

## 2. O que foi feito nesta sessão

1. **Backend reescrito** em `supabase/schema.sql` como fonte única (removidas todas as `migration_*.sql`). Tabelas `vendedores`/`campanhas`/`categorias`/`vendas`/`importacoes`; `versao_regras = 4`.
2. **Importação** simplificada: `lib/importacaoGuia.ts` com 3 colunas (`Vendedor`, `Valor Vendido`, `Categoria`); campanha escolhida no upload (`app/admin/upload/page.tsx` → `POST /api/importar` → `jj_importar`).
3. **Categorias** ganharam cadastro próprio: `app/admin/categorias/page.tsx` e `DELETE /api/categorias` → `jj_excluir_categoria`.
4. **Ranking por valor** em `jj_calcular_ranking`; `components/CopaRanking.tsx` reescrito (exporta `dinheiro`) e `components/EvolutionChart.tsx` criado.
5. **Auditoria/desfazer** adaptados: `importacoes.ordem bigserial` + coluna `inseridas`; desfazer só a última, uma vez; busca literal via `strpos`.
6. **Removidos:** `lib/pontuacao.ts`, `lib/produtosExcel.ts`, `components/PointsProgress.tsx`, `components/RankingTable.tsx`, `components/CampanhaCard.tsx`, `components/Header.tsx`, `app/admin/produtos`, `app/admin/marcas`, `app/api/produtos*`, `app/api/datas-itens`, scripts de produtos e testes antigos.
7. **Testes reescritos:** `test/importacao.test.ts`, `test/backend.test.mjs`, `test/auditoria.test.mjs`, `scripts/test.mjs`. Resultado: **49/49 aprovados**, `typecheck` e `build` limpos.

## 3. Modelo vigente (`versao_regras = 4`)

- **Planilha:** 3 colunas obrigatórias — `Vendedor` (nome ou login de vendedor ativo), `Valor Vendido` (≥ 0, até 2 casas), `Categoria` (precisa existir). Limite: `.xlsx`, 5 MB, 5.000 linhas.
- **Campanha:** escolhida na tela de upload; todas as linhas entram nessa campanha. Sem coluna de campanha no arquivo.
- **Sem produtos, sem marcas, sem pontos.** O vínculo de venda é só por vendedor + categoria + valor.
- **Ranking:** soma de `valor_vendido` por campanha; prêmios 1º/2º/3º (padrão 2000/1500/500). Empate → posição compartilhada e prêmio pendente.
- **Importação idempotente por lote:** cada upload insere linhas com `importacao_id`; nada é atualizado por código de item.
- **Data de faturamento:** opcional via backend (`data_faturamento`), com limite final exclusivo em 01/01/2027 no fuso `America/Sao_Paulo`.

## 4. Privacidade do vendedor

- `jj_bootstrap` devolve para não-admin `vendas=[]`, `vendedores` só o próprio cadastro e `rankings` mínimos (`campanha_id`, `vendedor_id`, `posicao`). Admin recebe o ranking completo.
- UI: `/painel` mostra apenas a posição por campanha; menu do vendedor só "Minha posição".

## 5. Banco

- Fonte única: `supabase/schema.sql`. Rodar inteiro no SQL Editor. Recria `campanhas`/`categorias`/`vendas`/`importacoes` e **preserva `vendedores`** (admin inicial `admin`/`123456`).
- Diagnóstico: `npm run check:supabase` (lista `vendedores`, `campanhas`, `categorias`, `vendas`, `importacoes` e as RPCs atuais).

## 6. Pendências concretas

1. **Supabase real:** aplicar `supabase/schema.sql` (nada foi executado no banco real nesta sessão).
2. **Publicação Vercel** `campanhasjj` a cargo do usuário (guia em `ENTREGA.md`; vars `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; build `npm run build`).
3. **Escala:** teste de volume (10k/50k/100k vendas).
4. **Revisão visual** no navegador após deploy (não afirmar inspeção visual sem evidência).
5. Trocar senha do admin inicial e cadastrar usuários definitivos.

## 7. Comandos

```powershell
Set-Location C:\campanha-jj
npm test
npm run typecheck
npm run build
npm run check:supabase
```

## 8. Arquivos-chave

- Backend: `supabase/schema.sql`.
- Importação: `lib/importacao.ts`, `lib/importacaoGuia.ts`, `lib/excel.ts`, `app/admin/upload/page.tsx`, `app/api/importar/route.ts`.
- Ranking/UI: `lib/copa.ts`, `components/CopaRanking.tsx`, `components/EvolutionChart.tsx`, `components/TeamProgress.tsx`, `app/admin/page.tsx`, `app/painel/page.tsx`.
- Privacidade/sessão: `lib/auth.tsx`, `lib/server.ts`, `app/api/session/route.ts`.
- Auditoria: `app/admin/auditoria/page.tsx`, `components/ConfirmUndoImport.tsx`, `lib/auditoria.ts`, `app/api/auditoria/route.ts`.
- Exclusões: `components/ConfirmDelete.tsx`, `app/api/categorias/route.ts`, `app/api/vendedores/route.ts`, `app/api/campanhas/route.ts`.
- Testes: `test/importacao.test.ts`, `test/backend.test.mjs`, `test/auditoria.test.mjs`, `test/origem.test.ts`, `scripts/test.mjs`.
- Docs: `README.md`, `ENTREGA.md`, `STATUS.md`, `AGENTS.md`.
