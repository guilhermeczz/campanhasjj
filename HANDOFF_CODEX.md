# Handoff — Campanhas JJ (para próxima IA / Codex)

Data: 2026-10-05. Projeto: `C:\campanha-jj`. Repo remoto: `https://github.com/guilhermeczz/campanhasjj`.

## 1. Estado do Git
- `git init` feito, branch `main`, `origin` = `https://github.com/guilhermeczz/campanhasjj.git`, `git fetch origin` ok.
- Usuário escolheu "Só vincular" (sem commit/push). Todo o projeto segue `untracked`, sem commits locais.
- Remoto tem só `045a7ec Initial commit` com `README.md` = `# campanhasjj`.
- README local é completo (132 linhas). Quando for fazer push inicial: commitar tudo, `pull --rebase origin main` (vai conflitar no README — manter o local completo), depois `push -u origin main`.
- Não commitar `.env.local`, `.next/`, `.next-dev/`, `node_modules/` (ver `.gitignore`).

## 2. O que foi feito nesta sessão
1. Vinculação ao GitHub (só remote + fetch, sem push por escolha do usuário).
2. Exclusão de produtos — continuação de outra IA:
   - Núcleo já existia: `supabase/migration_backend_seguro.sql` (`excluido_em` + `jj_excluir_produto`), `supabase/migration_exclusao_produtos.sql`, `app/admin/produtos/page.tsx` (botão vermelho + `ConfirmDelete`), `app/api/produtos/route.ts` (DELETE), `lib/store.tsx:excluirProduto`, `components/ConfirmDelete.tsx` (tipo produto), `lib/server.ts:58` (mensagem de migração pendente).
   - Verificado: `node scripts/build-products-migration.mjs` sem diff (migração derivada em sync com backend).
   - Adicionado: teste backend em `test/backend.test.mjs` (`excluir produto remove do catálogo, preserva vendas e libera recadastro`), `jj_excluir_produto` em `scripts/check-supabase.mjs`, docs em `README.md` + `ENTREGA.md` (fluxo + quando rodar `migration_exclusao_produtos.sql`), contagem 86 -> 90 testes.
   - Validação: `npm test` = 91 pass; `npm run build` ok (inclui `/admin/produtos` e `/api/produtos`).
   - Modelo de vendas enxuto (pedido do usuário): `lib/importacaoGuia.ts:MODELO_VENDAS` com 7 colunas (Código do item, Vendedor, Produto, Quantidade, Código da marca, Data do faturamento, Valor da venda). Cliente virou opcional (`CLIENTE_PADRAO = "NAO-INFORMADO"` quando ausente; sem a coluna, o desempate por clientes fica neutro). Sem mudança no banco — o frontend sempre envia um `cliente_id` válido.
3. Regra de pontos confirmada ao usuário: SIM, multiplicação (ver seção 3).
4. Ranking: explicado que hoje é só faturamento; usuário escolheu "Exibir os dois" (faturamento + pontos lado a lado). MAPEADO, NÃO IMPLEMENTADO (ver seção 4).
5. Decimais: confirmado cálculo proporcional com 2 casas (ver seção 3).

## 3. Regra de pontos (vigente, `versao_regras=3`)
- Fórmula no banco `supabase/migration_backend_seguro.sql:335`: `round((bruto-devolucao-cancelamento)*pontos_base,2)` se `faturado`, senão 0.
- Frente `lib/pontuacao.ts:17-21` `calcularPontosProduto()`: mesma conta em centavos inteiros (BigInt) para igualar o PostgreSQL.
- Exemplos: `R$100 x 1 = 100 pts`; `R$100 x 1,5 = 150 pts`; `R$859,90 x 1,5 = 1289,85 pts`; `R$6,99 x 1,5 = 10,49 pts`.
- Quantidade NÃO multiplica de novo; `preco_venda` é só catálogo; cancelado/pendente = 0; devolução/cancelamento parcial reduzem a base.
- Testes: `test/backend.test.mjs:390-404` (multiplicador), `test/produtos.test.ts:66-67`.
- Docs: `README.md:87-90`, texto em `app/admin/produtos/page.tsx:102-103`.

## 4. Ranking hoje + pedido pendente "Exibir os dois"
Estado atual (não mudar sem pedido explícito):
- SQL `public.jj_calcular_ranking()` em `supabase/migration_backend_seguro.sql:163-216`: ordena por `liquido desc, clientes desc, geral desc` (`rank()` por campanha). Prêmios TOP3 (2000/1500/500) e `EMPATE - AGUARDANDO DECISÃO DA DIRETORIA` seguem essa ordem.
- `total_pontos` é anexado depois no `jj_bootstrap` (`:236-242`) via `sum(v.pontos)` — NÃO ordena.
- UI `components/CopaRanking.tsx:17`: "Pontos dos produtos — Informativos; não alteram a classificação". Detalhe mostra faturamento bruto/devoluções/cancelamentos/clientes/geral.
- `app/admin/page.tsx:19`: `TeamProgress` (pontos por vendedor, ordem alfabética) + `details` "Classificação e prêmios por faturamento" com `CopaRanking`.
- `app/painel/page.tsx:21`: subtítulo "A classificação e os prêmios seguem o faturamento líquido."
- Tipos: `lib/copa.ts` (`ResultadoVendedorMarca` já tem `total_pontos`), `lib/store.tsx` (`PontuacaoCampanha`), `lib/acompanhamento.ts` (agrupa pontos/líquido por vendedor).

Pedido do usuário (escolha em questionário): "Exibir os dois".
Implementação sugerida (sem mudar prêmios nem DB):
- Derivar ranking por pontos no cliente a partir das `linhas` já recebidas (ordenar cópia por `total_pontos desc`, desempatar por `faturamento_liquido_marca desc` ou manter simples e documentar).
- Em `components/CopaRanking.tsx`: adicionar toggle/seções "Por faturamento (oficial — prêmios)" vs "Por pontos (informativo)", ou tabela dupla; atualizar textos que dizem "não alteram a classificação".
- Em `app/admin/page.tsx` e `app/painel/page.tsx`: ajustar subtítulos; vendedor vê só os próprios nas duas visões (respeitar privacidade atual: `rankings` já filtrado por `vendedor_id`).
- Não alterar `jj_calcular_ranking()` nem prêmios nesta etapa; se um dia pontos valerem prêmio, será migração SQL + testes novos.
- Testes/docs: acrescentar teste de ordenação client-side (ex.: `test/acompanhamento.test.ts` ou novo `ranking-pontos.test.ts`), atualizar `README.md:93-94,108-114`, `ENTREGA.md`, `STATUS.md`.

## 4b. Privacidade do vendedor: só posição (pedido do usuário, implementado)
- Regra: vendedor vê apenas sua posição por campanha, sem pontos, valores, vendas ou diferença para outros. Pontos/faturamento só no ADMIN, inclusive no banco (`jj_bootstrap` devolve `vendas=[]`, `pontuacoes=[]` e rankings mínimos `campanha_id/marca_id/marca_nome/posicao` para não-admin).
- UI: `app/painel/page.tsx` reescrito (cards de posição, sem pontos/evolução/vendas); `app/painel/vendas/page.tsx` redireciona para `/painel`; menu vendedor só "Minha posição" (`components/Sidebar.tsx`); `CopaRanking` `apenasVendedor` reduzido a posição.
- Posição continua calculada sobre todos no PostgreSQL e filtrada por vendedor (rank real, sem vazar colegas).
- Banco real: reaplicar `migration_backend_seguro.sql` (preserva dados) + `migration_auditoria_importacoes.sql` + `migration_exclusao_produtos.sql` (regenerada do backend; ordem: backend → auditoria → exclusão).

## 5. Exclusão de produtos (como está)
- Backend: `jj_excluir_produto(p_token,p_id,p_confirmar)` — só admin, exige `p_confirmar=true`, `pg_advisory_xact_lock(7482028)`, soft delete (`ativo=false, excluido_em=clock_timestamp()`). Vendas/pontos preservados. Mesmo nome/código pode ser recadastrado com novo ID; editar ID excluído bloqueia ("Cadastre ou importe um novo produto").
- `jj_salvar` (produtos), `jj_importar_produtos`, `jj_private.importar_vendas` filtram `excluido_em is null`; `jj_bootstrap` só lista não excluídos para admin.
- Fluxo UI: lista em `app/admin/produtos/page.tsx:136-137` -> `ConfirmDelete` -> `DELETE /api/produtos {id, confirmar:true}` -> `recarregar()`.
- Migração Supabase real: se `npm run check:supabase` acusar `jj_excluir_produto` pendente, rodar `supabase/migration_exclusao_produtos.sql` no SQL Editor (depois do backend, antes ou depois da auditoria; preserva vendas/auditoria/RPC). Banco novo não precisa dela (backend atual já inclui).
- Ordem geral banco novo: `schema.sql` -> `migration_copa.sql` -> `migration_campanhas_por_marca.sql` -> `migration_backend_seguro.sql` -> `migration_auditoria_importacoes.sql` (+ `migration_exclusao_produtos.sql` só se backend antigo sem exclusão).

## 6. Pendências concretas
1. Supabase real: rodar `migration_auditoria_importacoes.sql` (auditoria/desfazer pendente) e, se preciso, `migration_exclusao_produtos.sql`. Nada foi executado no banco real nesta sessão (só PGlite em memória).
2. Implementar "Exibir os dois" rankings (ver seção 4).
3. Revisão visual no navegador pendente (sem navegador conectado nesta sessão; não afirmar inspeção visual).
4. Publicação Vercel `campanhasjj` a cargo do usuário (guia em `ENTREGA.md:64-89`; vars `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; build `npm run build`).
5. Importação real: `vendas_e_nf-e_528186446572103.xlsx` (339 produtos, marca AMANCO), mais cadastro de vendedores e conferência de campanhas — tudo manual pelo usuário.
6. `STATUS.md` está desatualizado (fala em 74 testes); `ENTREGA.md` já atualizado para 90.

## 7. Comandos
```powershell
Set-Location C:\campanha-jj
npm test
npm run build
npm run check:supabase
node scripts/check-products-file.mjs "caminho-do-arquivo.xlsx"
node scripts/build-products-migration.mjs
node scripts/check-http.mjs  # com `npm run dev` aberto
```

## 8. Arquivos-chave
- Ranking: `supabase/migration_backend_seguro.sql:163-242`, `lib/copa.ts`, `components/CopaRanking.tsx`, `components/TeamProgress.tsx`, `lib/acompanhamento.ts`, `app/admin/page.tsx`, `app/painel/page.tsx`.
- Pontos: `lib/pontuacao.ts`, `lib/produtosExcel.ts`, `lib/importacao.ts`, `test/backend.test.mjs:370-432`, `test/produtos.test.ts`.
- Exclusão produtos: `app/admin/produtos/page.tsx`, `app/api/produtos/route.ts`, `lib/store.tsx:76-79`, `components/ConfirmDelete.tsx`, `supabase/migration_exclusao_produtos.sql`, `scripts/build-products-migration.mjs`.
- Auditoria: `app/admin/auditoria/page.tsx`, `components/ConfirmUndoImport.tsx`, `app/api/auditoria/route.ts`, `lib/auditoria.ts`, `supabase/migration_auditoria_importacoes.sql`, `test/auditoria.test.mjs`.
- Docs: `README.md`, `ENTREGA.md`, `STATUS.md`.
