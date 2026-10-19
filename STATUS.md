# Status do Campanhas JJ — 18/10/2026

## Atualização: modelo de valor vendido + categorias

Migração concluída do modelo antigo (produtos + pontos) para **ranking por valor vendido** com **categorias**. Foram removidos produtos, marcas e toda a pontuação.

### O que mudou

- **Planilha de vendas:** 3 colunas — `Vendedor`, `Valor Vendido`, `Categoria`. A **campanha é escolhida na tela de upload**, não vem no arquivo.
- **Backend reescrito** em `supabase/schema.sql` (fonte única; todas as `migration_*.sql` antigas foram removidas). Tabelas: `vendedores`, `campanhas`, `categorias`, `vendas`, `importacoes`. `versao_regras = 4`.
- **Modelo de importação:** cada upload **insere** linhas (`importacao_id`); não há atualização por código de item. Uma linha inválida desfaz o lote inteiro (atômico).
- **Categorias:** categoria não cadastrada bloqueia a linha. Nova página `/admin/categorias` e rota `DELETE /api/categorias` (`jj_excluir_categoria`), preservando vendas já registradas.
- **Ranking por valor** em `jj_calcular_ranking`: prêmios 1º/2º/3º por campanha; empate → posição compartilhada e `valor_premio` nulo com `EMPATE - AGUARDANDO DECISÃO DA DIRETORIA`.
- **Auditoria e desfazer** adaptados: `importacoes` tem `ordem bigserial` (desfazer só a última, uma vez) e coluna `inseridas`; busca literal por arquivo/responsável.
- **Resumo e evolução** por campanha (`jj_resumo_campanha`, `jj_evolucao_campanha`) por valor vendido; incluindo vendedores zerados e excluídos com histórico.
- **Frontend:** telas de admin (ranking, upload, auditoria, campanhas, categorias, vendedores) e do vendedor (só posição) atualizadas; novos `EvolutionChart.tsx` e `app/admin/categorias`. Removidos `PointsProgress`, `RankingTable`, `CampanhaCard`, `Header`, `lib/pontuacao.ts`, `lib/produtosExcel.ts`, `app/admin/produtos`, `app/admin/marcas` e rotas correlatas.
- **Modelo Excel:** `import_modelo_base.xlsx` (aba `Vendas`, 3 colunas, sem exemplos).

### Validação desta etapa

- `npm test`: **49 testes aprovados** (importação, regras, ranking por valor, resumo/evolução, auditoria/desfazer, exclusões, privacidade, bootstrap e segurança).
- `npm run typecheck`: limpo. `npm run build`: compilação de produção aprovada.
- Correções finais da suíte: precedência de `await` em asserções de auditoria, campo `vendas: []` no `jj_bootstrap`, busca literal por `strpos` e `reset role` no `beforeEach`.
- Nenhuma migração foi executada no Supabase real nesta etapa (só PGlite em memória).

## Pendências concretas

1. **Supabase prod:** aplicar `supabase/schema.sql` no SQL Editor e recarregar o app. Isso recria o modelo de valor vendido. Confirmar com `npm run check:supabase`.
2. **Publicação Vercel** (`campanhasjj`) a cargo do usuário; guia em `ENTREGA.md`.
3. **Escala:** teste de volume com massa sintética (10k/50k/100k vendas) — ainda não executado.
4. **Revisão visual** no navegador após o deploy.
5. Trocar a senha do admin inicial (`admin` / `123456`) e cadastrar os usuários definitivos.

## Arquivos-chave desta etapa

- `supabase/schema.sql` — backend completo (fonte única).
- `lib/importacao.ts`, `lib/importacaoGuia.ts`, `lib/excel.ts`, `lib/types.ts` — importação/validação e tipos.
- `lib/store.tsx`, `lib/copa.ts`, `lib/acompanhamento.ts`, `lib/auditoria.ts` — estado e cálculos de apresentação.
- `components/CopaRanking.tsx`, `components/EvolutionChart.tsx`, `components/TeamProgress.tsx`, `components/ImportHelp.tsx`, `components/ConfirmDelete.tsx`, `components/ConfirmUndoImport.tsx`, `components/Sidebar.tsx`.
- `app/admin/*` (ranking, upload, auditoria, campanhas, categorias, vendedores) e `app/painel/*`.
- `test/importacao.test.ts`, `test/backend.test.mjs`, `test/auditoria.test.mjs`, `test/origem.test.ts`; `scripts/test.mjs`.

## Comandos

```powershell
Set-Location C:\campanha-jj
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run check:supabase
```

Servidor de desenvolvimento em `http://127.0.0.1:3000`. Cache de desenvolvimento em `.next-dev`, separado do build de produção em `.next`.
