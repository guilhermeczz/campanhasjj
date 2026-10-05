# Campanhas JJ — Construjota

Aplicativo web responsivo em preto e amarelo para a Copa dos Campeões. Cada marca tem sua própria campanha e classificação por faturamento líquido. O faturamento geral é usado somente como desempate. A interface usa Inter, ícones vetoriais e tamanhos de texto padronizados, sem emojis.

## Acesso e navegação

- `/` encaminha para `/login`. Uma sessão válida abre a área correspondente ao perfil.
- Diretoria: resultados por campanha, importação de vendas, auditoria de importações, campanhas, marcas/produtos e vendedores.
- Vendedor: somente sua posição em cada campanha, sem pontos, valores, vendas ou dados de outros vendedores. Pontos e faturamento são visíveis somente para a diretoria, inclusive no banco.
- Login por usuário e senha de seis dígitos. Senhas armazenadas como bcrypt; sessão em cookie HttpOnly por até 12 horas; cinco tentativas incorretas bloqueiam o usuário por 15 minutos.
- O app exige o Supabase configurado e as migrations aplicadas. Não há fallback com dados demo nem salvamento de vendas no navegador.
- A exclusão de vendedores exige confirmação em um diálogo com ação vermelha. Ela revoga as sessões, impede novos acessos e remove o usuário da listagem; as vendas vinculadas permanecem no histórico da diretoria.
- A exclusão de produtos segue o mesmo padrão: botão vermelho com confirmação, remove o produto do catálogo e bloqueia novas importações com aquele nome/código, preservando vendas, pontos e histórico. O mesmo nome/código pode ser recadastrado como um novo produto.
- O painel da diretoria mostra pontos de todos os vendedores, inclusive zerados, busca e evolução acumulada por data de faturamento. A classificação por faturamento fica em seção separada. Cada vendedor vê apenas sua própria posição, sem pontos ou valores.
- Correções e devoluções atualizam a curva do período; ela apresenta os valores atuais por data de faturamento. O botão Atualizar resultados busca os dados mais recentes.

## Executar localmente

```sh
npm install
npm run dev
```

Acesse `http://localhost:3000`. Configure `.env.local` a partir de `.env.example` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Não coloque credenciais administrativas no frontend.

## Atualizar o banco existente

Se o backend seguro atual já foi aplicado, execute **somente** `supabase/migration_auditoria_importacoes.sql` no SQL Editor do mesmo projeto Supabase para ativar auditoria e desfazer. Se o banco ainda não tem a exclusão de produtos (`jj_excluir_produto` ausente no diagnóstico), execute também `supabase/migration_exclusao_produtos.sql` depois do backend e antes ou depois da auditoria — ela preserva vendas, auditoria e a RPC de importação. Se ainda não foi aplicado, execute primeiro `supabase/migration_backend_seguro.sql`: ele preserva cadastros e vendas, converte senhas em hashes e fecha o acesso direto às tabelas. A auditoria sempre deve ser aplicada depois do backend, inclusive ao reaplicar uma atualização dele.

Não reaplique os scripts antigos depois da migração de segurança: eles pertencem à configuração inicial e podem restaurar políticas antigas. Para um banco novo, a ordem é:

1. `supabase/schema.sql`
2. `supabase/migration_copa.sql`
3. `supabase/migration_campanhas_por_marca.sql`
4. `supabase/migration_backend_seguro.sql`
5. `supabase/migration_auditoria_importacoes.sql`

Publique a versão atual do app junto dessa atualização do banco: versões antigas acessavam as tabelas diretamente. Os cadastros iniciais dos scripts são de demonstração; revise os acessos antes do uso real.

```sh
npm run check:supabase
```

Esse comando faz consultas de diagnóstico sem modificar registros. Após a migração, consultas diretas às tabelas devem ser negadas e a chamada sem sessão deve retornar erro de autenticação. O novo login só funciona depois de aplicar a migração complementar.

## Como importar vendas

Na área da diretoria, abra **Importar vendas** e baixe o modelo. O arquivo tem somente a aba **Vendas**, com os cabeçalhos prontos e sem exemplos, explicações ou abas extras. Preencha a partir da linha 2, selecione o arquivo, revise e confirme.

O modelo usa títulos em português e traz **7 colunas: 6 obrigatórias + data** (recomendada, mas opcional). Cliente, devolução, cancelamento e situação podem ser adicionados como colunas extras quando necessário. A tela inclui ajuda pesquisável, exemplos por coluna, perguntas frequentes, consulta de códigos de marcas e logins com botão Copiar, além de correções organizadas por linha. Modelos antigos com os nomes técnicos continuam aceitos.

| Coluna no modelo | Conteúdo |
| --- | --- |
| Código do item | Código único e permanente do item da nota. Reenviar o mesmo código atualiza a venda. |
| Vendedor | Login do vendedor ativo. |
| Produto | Código ou nome exato de um produto ativo e com regra configurada na marca informada; consulte a ajuda da página. |
| Quantidade | Quantidade maior que zero. |
| Código da marca | ID ou código externo exato, disponível na consulta da página. |
| Data do faturamento | Opcional, mas recomendada: data real do faturamento; texto sem fuso é interpretado como horário de São Paulo (UTC−03 no período da Copa). Em branco usa a data da importação. |
| Valor da venda (R$) | Total bruto do item, em reais, antes dos descontos. |
| Código do cliente | Opcional (fora do modelo): código estável do cliente para o desempate por clientes distintos. Sem essa coluna, o desempate fica neutro e decide pelo faturamento geral. |
| Devolução (R$) | Opcional: devolução acumulada do item. Em branco vale zero. |
| Cancelamento (R$) | Opcional: cancelamento parcial acumulado. Em branco vale zero. |
| Situação | Opcional: `faturado`, `cancelado` ou `pendente`. Em branco significa `faturado`. |

O arquivo pode conter vários vendedores, produtos e marcas. A campanha é determinada por **marca + período**, sem uma coluna de campanha preenchida manualmente. Inclua também vendas de marcas sem campanha para calcular o faturamento geral usado no desempate.

Limites: `.xlsx`, 5 MB e 5.000 linhas. Fórmulas, códigos repetidos no arquivo e dados inválidos bloqueiam o envio. A gravação é atômica: uma linha inválida desfaz o lote inteiro. Devoluções posteriores devem atualizar o item original com o mesmo `item_id`.

## Auditoria e reversão de vendas

Em `/admin/auditoria`, somente administradores consultam o histórico das importações concluídas, com arquivo, responsável autenticado, horário, quantidades inseridas/atualizadas, valores líquidos e pontos. A busca filtra arquivo ou responsável; são 20 registros por página e 100 linhas por página da prévia. O Supabase valida sessão e perfil nas funções de consulta e reversão. As tabelas privadas não são acessíveis diretamente e o bootstrap dos vendedores não inclui auditoria.

As prévias preservam os dados normalizados e os pontos calculados no envio. Não guardam o arquivo Excel nem sua formatação. Conteúdos idênticos compartilham uma prévia compacta. Registros anteriores à ativação e arquivos rejeitados não são reconstruídos. Auditoria e gravação das vendas ocorrem na mesma transação.

**Desfazer importação** exige confirmação e vale somente para a última importação concluída, uma vez: remove linhas novas e restaura integralmente as vendas atualizadas, incluindo seus IDs e datas originais. O histórico registra quando e por quem a ação foi desfeita, mantendo a prévia. A próxima importação substitui a reserva de restauração anterior; não há pilha de reversões. Importações que falham preservam essa reserva. Para refazer uma importação desfeita, envie o arquivo novamente.

A reversão verifica se as vendas e os produtos/campanhas envolvidos continuam iguais. Alterações posteriores bloqueiam a ação e orientam importar uma correção, sem sobrescrevê-las. Locks serializam importações, reversões e as alterações relevantes de cadastro. Apenas a última reserva é mantida, limitando o armazenamento extra necessário para desfazer. O histórico de prévias cresce conforme os uploads; o painel informa uma estimativa do tamanho dos dados, sem índices/metadados.

## Produtos e pontos por valor

Em **Produtos**, a diretoria cadastra e edita manualmente ou importa um arquivo `.xlsx` com estes campos:

| Descrição | Código | Preço Venda | pontos x R$ | Marca campanha |
| --- | --- | --- | --- | --- |
| Adaptador | 0002 | 6,99 | 1,5 | AMANCO |

**Regra confirmada: pontos = valor líquido vendido × pontos por real do produto.** R$ 100 × 1 = 100 pontos; R$ 100 × 1,5 = 150 pontos. `Preço Venda` é referência do catálogo e não é divisor. A quantidade de unidades não multiplica o resultado novamente.

O cálculo definitivo é feito no banco: `(valor_bruto - valor_devolucao - valor_cancelamento) * pontos_por_real`. Cancelados e pendentes valem zero. O resultado é arredondado para duas casas decimais por item: R$ 6,99 × 1,5 = 10,49 pontos. O navegador usa aritmética inteira para reproduzir o arredondamento do PostgreSQL.

A marca pode ser informada por nome, código externo ou ID. Quando o arquivo não tem marca, selecione-a na tela; ela será aplicada somente às linhas sem marca. O relatório real `vendas e nf-e` é reconhecido pelos cabeçalhos, sem renomear a aba. Código é opcional e conserva zeros à esquerda. As regras antigas gravadas como `valor_por_ponto` mantêm seu significado original por compatibilidade; o novo cadastro grava `pontos_por_real` e `preco_venda`.

O ranking e a premiação continuam seguindo faturamento líquido e os critérios de desempate existentes; pontos são informativos e separados. O vendedor recebe do backend somente sua posição por campanha; pontos, vendas e faturamento ficam restritos à diretoria.

Importar o mesmo código ou nome na mesma marca atualiza o cadastro. Código existente permite atualizar a descrição sem duplicar o produto. Conflitos de identificação bloqueiam o lote. Alterar o fator recalcula os pontos das vendas vinculadas, sem alterar faturamento ou classificação. Preço ou fator vazio, zero, negativo ou com mais de duas casas decimais é rejeitado. Produtos desconhecidos, inativos ou excluídos bloqueiam a importação de vendas. Excluir exige confirmação e não apaga vendas nem pontos; para reutilizar o nome/código, cadastre ou importe um novo produto.

O arquivo de produtos também oferece abas **Exemplo** e **Marcas**, que não são importadas. A revisão mostra novos produtos, atualizações e erros antes de confirmar. Se uma linha for inválida, nenhum produto do lote é salvo.

## Cálculo e dados utilizados

- `vendedores`: ID, login, nome, perfil e situação do acesso.
- `marcas`: ID estável, nome e código externo configurável.
- `produtos`: cadastro vinculado à marca, associado à venda quando o nome dentro da marca é inequívoco.
- `campanhas`: marca, início/fim, situação e valores dos três prêmios.
- `vendas`: uma linha por item faturado, com vendedor, produto, marca, cliente, data, status e valores financeiros. O projeto não possui tabelas separadas de notas, clientes ou devoluções.
- `campanha_marcas`: vínculo legado mantido compatível com as campanhas por marca.

A função PostgreSQL `jj_calcular_ranking` calcula a classificação; o navegador apenas apresenta o resultado. A Copa vai de 01/10/2026 até o fim de 31/12/2026 no fuso `America/Sao_Paulo`. O limite final é exclusivo em 01/01/2027, incluindo frações de segundo do último dia.

Para cada vendedor e marca, soma-se o faturamento bruto e descontam-se devoluções e cancelamentos. Itens pendentes não participam; itens cancelados não acrescentam líquido nem clientes. Clientes distintos contam apenas itens faturados com saldo positivo. Quem não tem saldo positivo na marca não entra na classificação.

A ordem é: faturamento líquido da marca, quantidade de clientes distintos e faturamento líquido geral do vendedor no mesmo período, incluindo outras marcas. Se todos os critérios empatarem, a posição é compartilhada e o prêmio fica pendente com `EMPATE - AGUARDANDO DECISÃO DA DIRETORIA`. Não há critério adicional por nome ou ID. Os prêmios padrão são R$ 2.000, R$ 1.500 e R$ 500.

As rotas Next.js `/api/session`, `/api/data`, `/api/cadastros`, `/api/importar`, `/api/produtos`, `/api/produtos/importar`, `/api/vendedores` e `/api/auditoria` usam as funções `jj_*` do banco. O banco verifica a sessão e o perfil, valida importações e filtra os dados do vendedor. A RPC antiga de importar permanece compatível e também registra auditoria.

## Validação

```sh
npm test
npm run typecheck
npm run build
```

Os testes executam as migrations em PostgreSQL via PGlite, inclusive permissões, hashes e funções como usuário `anon`. Cobrem os 13 cenários obrigatórios da campanha, empates no terceiro lugar, limites de datas, cancelamentos, reimportação, privacidade, expiração de sessão, bloqueio de login e cadastros. Também verificam os dois modelos Excel, pontos por valor líquido, recálculo, tentativa de adulterar pontos, exclusão de acesso e de produto, posição restrita do vendedor, datas, valores, zeros em códigos, fórmulas e planilhas inválidas. Esse banco de testes fica em memória; não modifica o Supabase real.

Depois de `npm test`, `node scripts/check-products-file.mjs "caminho-do-arquivo.xlsx"` testa o relatório AMANCO em banco temporário: leitura, cadastro, reimportação, pontos de uma venda simulada por produto, auditoria e desfazer. O arquivo real com 339 produtos passou nessa validação. O aplicativo verifica `versao_regras = 3`; versões antigas do backend precisam ser atualizadas, seguidas da migração de auditoria. O usuário já confirmou ter aplicado o backend atual.

Desenvolvimento usa `.next-dev`, separado da compilação de produção em `.next`, para permitir testar sem invalidar o servidor local.

## Vercel

O usuário fará a publicação com nome de projeto `campanhasjj`. O roteiro de publicação pela CLI, as duas variáveis do Supabase e os testes de entrega estão em [ENTREGA.md](ENTREGA.md). O build é `npm run build`, com framework Next.js. Em produção o cookie de sessão usa `Secure`, exigindo HTTPS. `.vercelignore` exclui arquivos de ambiente, SQL, testes e caches da publicação.
