# Continuação do Campanhas JJ — 05/10/2026

## Atualização: auditoria e desfazer

Pedidos mais recentes implementados: aba `/admin/auditoria` exclusiva do administrador, histórico de importações concluídas, prévia imutável paginada, responsável/data/contagens/pontos. Arquivos Excel não são armazenados: JSONB compacto com deduplicação SHA256. Apenas novas importações após ativação geram histórico. Arquivos rejeitados não são registrados.

Botão vermelho com confirmação para desfazer somente a última importação concluída, uma vez. Remove vendas novas e restaura atualizadas integralmente. Uma única reserva privada é substituída por uma nova importação bem-sucedida ou consumida ao desfazer; não existe pilha de reversões. Guarda autor e data da reversão sem excluir prévia/log. Hashes de vendas e dos produtos/campanhas anteriores e atuais bloqueiam reversão após mudanças relacionadas. Locks e transação mantêm atomicidade. Falhas não perdem a reserva anterior.

**Nova pendência obrigatória no Supabase:** executar `supabase/migration_auditoria_importacoes.sql` depois do backend seguro já aplicado. Diagnóstico remoto confirmou as quatro funções novas ausentes; nenhuma alteração foi feita no banco real. Não reaplicar scripts iniciais. Se futuramente reaplicar o backend, reaplicar a auditoria em seguida para manter o wrapper da RPC antiga.

Arquivos: nova página, `components/ConfirmUndoImport.tsx`, `app/api/auditoria/route.ts`, `lib/auditoria.ts`, nova migração e `test/auditoria.test.mjs`. Upload envia nome do arquivo e número da linha e oferece link ao histórico após sucesso. Menu somente de admin. Guia de ativação, limitações e testes manuais em ENTREGA.md.

Validação final desta etapa: `npm test` com 86 testes aprovados, incluindo lote de 5.000 linhas e conflito no produto anterior; `npm run build` aprovado. Teste local com 339 produtos/vendas: prévia 10.447 bytes, reserva de reimportação 41.516 bytes (estimativas sem índices/metadados); reenvios idênticos compartilham prévia. Teste HTTP: 10 páginas, 7 operações de API protegidas. Revisão visual autenticada segue pendente por ausência de navegador conectado. O usuário fará a publicação na Vercel.

## Escopo confirmado pelo usuário

- Cada marca tem sua campanha; classificação e premiação continuam por faturamento líquido, com os desempates existentes.
- Regra mais recente e definitiva: valor líquido vendido MULTIPLICADO por pontos por real. R$ 100 × 1 = 100 pontos; R$ 100 × 1,5 = 150 pontos. Substitui a interpretação anterior de divisão pelo preço. Preço Venda é referência de catálogo, sem entrar na conta. Quantidade não multiplica novamente.
- Cadastro por planilha: Descrição, Código, Preço Venda, pontos x R$. Marca campanha pode vir na planilha ou ser selecionada na tela para linhas sem marca. Preço e fator editáveis.
- Produto editável; alterar a regra recalcula os pontos das vendas vinculadas. O usuário informou que ainda não há histórico de produção e que a equipe só usará após validação.
- Vendedores só recebem seus próprios dados, pontos e resultados. Diretoria vê a equipe.
- Interface profissional em preto/amarelo, sem emojis. Exclusão de vendedor em vermelho e com confirmação, preservando as vendas.
- Modelo de vendas simplificado a pedido expresso: só uma aba Vendas com cabeçalhos, sem explicações, exemplos ou abas extras. Ajuda e consulta de marcas/produtos/vendedores ficam no site.
- Em 05/10, usuário confirmou que já aplicou a última migração, fará a publicação na Vercel como `campanhasjj` e cadastrará pessoalmente os usuários definitivos.

## Implementado

Login, páginas de marcas/produtos/vendedores, duas importações com revisão antes de confirmar, exclusão lógica com revogação de sessões, cálculo de pontos no PostgreSQL, filtros por usuário e tipografia Inter. Modelos Excel são gerados pelo próprio app. Documentação em README.md.

Painel da diretoria concluído: equipe inteira, inclusive zerados, total de pontos, busca por vendedor e evolução acumulada com tabela por dia. Classificação por faturamento em seção separada. Vendedor tem gráfico exclusivamente próprio. Botões de atualização manual. Sem meta percentual inventada, pois não há meta definida. Correções recalculam a curva por data de faturamento; não é histórico de versões dos uploads.

Corrigida validação de origem de APIs: Next normalizava request.url para localhost e rejeitava upload em 127.0.0.1. Agora usa Host público e HTTPS encaminhado, mantendo rejeição de origem externa. Testes cobrem também o cenário de proxy da Vercel.

O backend principal está em `supabase/migration_backend_seguro.sql`, já aplicado conforme confirmação explícita do usuário. Inclui `preco_venda` e `pontos_por_real` em produtos e vendas e bootstrap com `versao_regras = 3`. A etapa posterior de auditoria exige a nova migração indicada acima. Não executar novamente scripts iniciais. Regras legadas `valor_por_ponto` são preservadas, sem conversão silenciosa.

## Validação concluída

- `npm test`: 74 testes aprovados, incluindo vendedores zerados, evolução por data, filtro individual, fuso de São Paulo e validação de origem local/HTTPS, além de importação, multiplicação e privacidade.
- `npm run build`: compilação, tipos e geração de páginas aprovados.
- HTTP atual: 9 telas respondem; 5 APIs recusam requisições sem sessão; origem externa e senha malformada são rejeitadas. Script `node scripts/check-http.mjs`, servidor local aberto.
- Arquivo real: 339 produtos aprovados, cadastro e reimportação sem duplicatas, 339 vendas simuladas com cálculo do fator conferido contra a prévia. Totais e evolução do painel conferem com o PostgreSQL, incluindo colegas zerados. Banco PGlite em memória; Supabase real não modificado. Script: `node scripts/check-products-file.mjs "caminho.xlsx"` após `npm test`.
- Arquivos de interface verificados sem emojis.

## Pendências concretas

1. Publicação a cargo do usuário, ainda não feita. Projeto pretendido: `campanhasjj` na Vercel. Guia completo em ENTREGA.md, sem credenciais. `.vercelignore` preparado. Não publicar por conta própria: o usuário disse que ele fará isso.
2. Arredondamento atual: duas casas decimais por item, ex. R$ 6,99 × 1,5 = 10,49 pontos. Não houve confirmação específica de arredondamento, mas a multiplicação foi explicitamente confirmada.
3. Importação real pendente de sessão de diretoria na aplicação: `vendas_e_nf-e_528186446572103.xlsx`, na pasta WhatsApp `transfers/2026-40` informada. Aba `vendas e nf-e`, A1:D340. Selecionar AMANCO na tela e revisar os 339 produtos. O usuário cadastrará os vendedores. Conferir campanhas reais no acesso autenticado. Não foram fornecidas credenciais de diretoria nem navegador conectado; não tentar senhas de demonstração no banco real.
4. Revisão visual no navegador pendente: ferramenta de navegação não encontrou navegador disponível nesta sessão. Não afirmar que houve inspeção visual.

Servidor de desenvolvimento iniciado em http://127.0.0.1:3000. Cache de desenvolvimento em `.next-dev`, separado do build de produção em `.next`.
