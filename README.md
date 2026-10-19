# Campanhas JJ — Construjota

Aplicativo web responsivo em preto e amarelo para a Copa dos Campeões. O ranking é feito por **valor vendido**: cada vendedor acumula o total das vendas por campanha, com prêmios para o 1º, 2º e 3º lugares. Não há produtos nem pontos. A interface usa Inter, ícones vetoriais e tamanhos de texto padronizados, sem emojis.

## Acesso e navegação

- `/` encaminha para `/login`. Uma sessão válida abre a área correspondente ao perfil.
- Diretoria: ranking e resultados, importação de vendas, auditoria de importações, campanhas, categorias e vendedores.
- Vendedor: somente a própria posição em cada campanha, sem valores, vendas ou dados de outros vendedores. Os valores são visíveis apenas para a diretoria, inclusive no banco.
- Login por usuário e senha de seis dígitos. Senhas armazenadas como bcrypt; sessão em cookie HttpOnly `jj_session` por até 12 horas (Secure em produção).
- O app exige o Supabase configurado e o `supabase/schema.sql` aplicado. Não há fallback com dados demo nem salvamento de vendas no navegador.
- Exclusões (vendedor, campanha e categoria) exigem confirmação em um diálogo com ação vermelha e preservam o histórico. Excluir um vendedor revoga suas sessões e impede novos acessos; as vendas já importadas permanecem.

## Modelo de negócio

- **Ranking por valor vendido.** Para cada campanha, soma-se o `valor_vendido` de cada vendedor. Quem vendeu mais fica em 1º lugar.
- **Prêmios** por campanha, com padrão R$ 2.000, R$ 1.500 e R$ 500 (configuráveis na campanha).
- **Empate:** posições empatadas são compartilhadas e o prêmio fica pendente com `EMPATE - AGUARDANDO DECISÃO DA DIRETORIA`.
- **Categoria** é um rótulo do cadastro; a categoria da linha precisa existir antes da importação.
- **Pendência de valores** (aportes futuros no arquivo) ficam fora do escopo: a planilha tem apenas as três colunas abaixo.

## Executar localmente

```sh
npm install
npm run dev
```

Acesse `http://127.0.0.1:3000` (use este endereço, não `localhost`). Configure `.env.local` a partir de `.env.example` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Não coloque credenciais administrativas no frontend.

## Banco de dados

A fonte única do backend é `supabase/schema.sql`. Rode o arquivo inteiro no SQL Editor do Supabase. Ele **recria** as tabelas de negócio (`campanhas`, `categorias`, `vendas`, `importacoes`) e **preserva** `vendedores`, garantindo o admin inicial `admin` / `123456` (troque a senha depois). Cria também o schema privado `jj_private` (sessões) e as RPCs `jj_*`.

O aplicativo verifica `versao_regras = 4` no bootstrap; versões antigas do backend precisam ser atualizadas.

```sh
npm run check:supabase
```

Esse comando faz consultas de diagnóstico sem alterar registros. Após aplicar o schema, consultas diretas às tabelas devem ser negadas e a chamada sem sessão deve retornar erro de autenticação.

## Como importar vendas

Na área da diretoria, abra **Importar vendas**, escolha a **campanha** de destino no topo da página e baixe o modelo. O arquivo tem somente a aba **Vendas**, com três colunas obrigatórias:

| Coluna no modelo | Conteúdo |
| --- | --- |
| Vendedor | Nome ou login de um vendedor ativo. Ajuda na página lista os vendedores. |
| Valor Vendido | Valor da venda, em reais, maior ou igual a zero e com até duas casas decimais (ex.: `1000,50`). |
| Categoria | Nome de uma categoria já cadastrada. Categorias desconhecidas bloqueiam a linha. |

O arquivo pode conter vários vendedores e categorias. A campanha **não** vai na planilha: ela é escolhida na tela antes de enviar, e todas as linhas entram nessa campanha.

Limites: `.xlsx`, 5 MB e 5.000 linhas. Fórmulas e dados inválidos bloqueiam o envio. A gravação é atômica: uma linha inválida desfaz o lote inteiro. Cada importação **insere** linhas novas (sem atualização por código de item).

## Auditoria e reversão de vendas

Em `/admin/auditoria`, somente administradores consultam o histórico das importações concluídas, com arquivo, responsável autenticado, horário, quantidade inserida e valor total. A busca filtra arquivo ou responsável; são 10 registros por página e 20 linhas por página da prévia. O Supabase valida sessão e perfil nas funções de consulta e reversão. As tabelas privadas não são acessíveis diretamente.

**Desfazer importação** exige confirmação e vale somente para a **última** importação concluída, **uma única vez**: remove todas as linhas gravadas por aquele upload. O histórico registra quando e por quem a ação foi desfeita, mantendo a prévia. A ordenação usa `importacoes.ordem (bigserial)`; não há pilha de reversões. Para refazer, envie o arquivo novamente.

## Cálculo e dados utilizados

- `vendedores`: ID, login, nome, perfil e situação do acesso.
- `campanhas`: nome, período, situação e valores dos três prêmios.
- `categorias`: nome e situação.
- `vendas`: uma linha por venda, com vendedor, valor vendido, categoria, campanha, data de faturamento e vínculo com a importação.
- `importacoes`: histórico da auditoria (arquivo, responsável, totais e prévia em JSONB).

A função PostgreSQL `jj_calcular_ranking` calcula a classificação; o navegador apenas apresenta o resultado. A Copa vai de 01/10/2026 até 31/12/2026 no fuso `America/Sao_Paulo`; o limite final é exclusivo em 01/01/2027, incluindo frações de segundo do último dia. O resumo e a evolução por campanha (`jj_resumo_campanha` e `jj_evolucao_campanha`) também são calculados no banco.

As rotas Next.js `/api/session`, `/api/data`, `/api/cadastros`, `/api/importar`, `/api/categorias`, `/api/campanhas`, `/api/vendedores`, `/api/resumo`, `/api/evolucao` e `/api/auditoria` usam as funções `jj_*` do banco. O banco verifica a sessão e o perfil, valida importações e filtra os dados do vendedor.

## Validação

```sh
npm test
npm run typecheck
npm run build
```

Os testes executam o `schema.sql` em PostgreSQL via PGlite (em memória, com `pgcrypto`), inclusive permissões e funções como usuário `anon`. Cobrem importação e limites, regras de negócio, ranking por valor e empates, resumo/evolução, auditoria e desfazer, exclusões, privacidade do vendedor, bootstrap leve e cenários de segurança. O banco de testes fica em memória; não modifica o Supabase real.

Desenvolvimento usa `.next-dev`, separado da compilação de produção em `.next`, para permitir testar sem invalidar o servidor local.

## Vercel

O usuário fará a publicação com nome de projeto `campanhasjj`. O roteiro de publicação pela CLI, as duas variáveis do Supabase e os testes de entrega estão em [ENTREGA.md](ENTREGA.md). O build é `npm run build`, com framework Next.js. Em produção o cookie de sessão usa `Secure`, exigindo HTTPS.
