# Entrega do Campanhas JJ

## O que está pronto

- Ranking por **valor vendido** por campanha, com prêmios de 1º, 2º e 3º lugares.
- Cadastro de **categorias** (nome) usado na importação; categoria inexistente bloqueia a linha.
- Vendas: planilha de uma aba com três colunas (`Vendedor`, `Valor Vendido`, `Categoria`) e **campanha escolhida na tela** antes de enviar.
- Diretoria: ranking, resumo de todos os vendedores (inclusive zerados), busca e evolução acumulada por data de faturamento.
- Vendedor: somente a própria posição em cada campanha, sem valores, vendas ou dados de outros. A privacidade é aplicada no banco.
- Exclusão de vendedor, campanha e categoria com confirmação vermelha e preservação do histórico.
- Auditoria exclusiva do administrador, com responsável, horário, quantidade inserida, valor total e prévia de cada importação concluída.
- Desfazer a última importação, com confirmação vermelha, uma única vez.

## Supabase

A fonte única do backend é `supabase/schema.sql`. **Execute o arquivo inteiro no SQL Editor do Supabase.** Ele recria as tabelas de negócio do modelo de valor vendido e preserva `vendedores` (garantindo o admin inicial `admin` / `123456` — troque a senha depois). O app verifica `versao_regras = 4`; sem isso, mostra o aviso de atualização pendente.

Se o diagnóstico abaixo indicar funções pendentes, reaplique o `schema.sql`:

```powershell
npm run check:supabase
```

O histórico de auditoria começa nas próximas importações concluídas; uploads antigos não são reconstruídos e arquivos rejeitados não entram no histórico.

## Auditoria e desfazer

Na aba **Auditoria**, busque o arquivo ou responsável e clique em **Ver prévia**. Os dados são os valores gravados no envio (vendedor, categoria, valor, linha); o Excel original, suas fórmulas e formatação não são armazenados.

O botão vermelho **Desfazer importação** aparece somente na última importação concluída. A confirmação remove todas as linhas gravadas por aquele upload. O histórico registra data e administrador da reversão. Uma nova importação substitui a possibilidade de desfazer a anterior; não há reversões em sequência. Para refazer, importe o arquivo novamente.

### Teste específico da função

1. Após aplicar o `schema.sql`, cadastrar uma campanha, uma categoria e um vendedor de teste.
2. Importar duas linhas de R$ 100 para vendedores diferentes e conferir o ranking e a prévia na Auditoria.
3. Importar mais uma linha para o mesmo vendedor e ver o acumulado subir no ranking e na evolução.
4. Abrir **Desfazer importação** e escolher **Manter**: nada muda.
5. Reabrir e confirmar: as linhas da última importação somem e o histórico fica marcado como **Desfeita**.
6. Confirmar que o botão não permite desfazer a mesma importação novamente e que a prévia segue consultável.
7. Entrar como vendedor: nenhum menu de auditoria e nenhum acesso a `/admin/auditoria` ou às suas APIs.
8. Testar a consulta e a confirmação também no celular.

## Preparar os cadastros

1. Entrar como diretoria em `http://127.0.0.1:3000/login` (`admin` / `123456` e trocar a senha).
2. Em **Categorias**, cadastrar as categorias que aparecerão na planilha de vendas.
3. Em **Campanhas**, cadastrar nome, período e prêmios (padrão R$ 2.000 / 1.500 / 500).
4. Em **Vendedores**, cadastrar os usuários definitivos (login, nome, senha de 6 dígitos e perfil).
5. Importar as vendas escolhendo a campanha de destino.

O cliente precisará atualizar cadastros somente quando surgir uma nova categoria, vendedor ou campanha. No uso diário, basta importar vendas.

## Testar antes da entrega

Use uma campanha e um vendedor destinados à validação. O teste grava vendas no banco conectado; depois, use **Desfazer importação** para removê-las.

1. Baixar o modelo em **Importar vendas**. Deve abrir apenas a aba Vendas, com as 3 colunas.
2. Escolher a campanha de teste no topo, preencher uma linha de R$ 100 para um vendedor ativo e uma categoria existente, e confirmar.
3. A diretoria deve mostrar esse vendedor no ranking com R$ 100; outro vendedor sem vendas aparece com zero no resumo.
4. Conferir a evolução acumulada na data do faturamento e o filtro individual.
5. Importar uma segunda linha e confirmar que os valores somam (cada importação adiciona).
6. Testar uma linha com categoria inexistente: deve bloquear o lote inteiro (nada é gravado).
7. Entrar como vendedor em outra janela: somente a posição em cada campanha, sem valores.
8. Testar em celular: seleção da campanha, busca de vendedor, gráfico, revisão da planilha e confirmação.

## Publicar como campanhasjj na Vercel

Você fará a publicação. A compilação local já foi validada. O projeto usa Next.js e o comando de build é `npm run build`.

No PowerShell, na pasta do projeto:

```powershell
Set-Location C:\campanha-jj
npx.cmd vercel login
npx.cmd vercel link
```

Selecione sua conta/equipe e crie o projeto com nome `campanhasjj`. Depois, no painel da Vercel, em Settings → Environment Variables, configure para Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Use os valores já existentes em `.env.local`. A aplicação usa a chave pública anon; não precisa de chave administrativa. O arquivo local não é enviado na publicação.

Com as duas variáveis configuradas:

```powershell
npx.cmd vercel --prod
```

Abra o endereço HTTPS retornado e repita login, download do modelo e o teste de importação. [Fluxo oficial de publicação pela CLI](https://vercel.com/docs/projects/deploy-from-cli).

## Verificações executáveis

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run check:supabase
```

Para executar localmente após fechar o servidor: `npm.cmd run dev`. Sempre use `http://127.0.0.1:3000`.

Os testes de banco executam em memória (PGlite) e não modificam o Supabase real. Resultado atual: **49 testes aprovados**, `typecheck` e `build` limpos. Revisão visual e importação autenticada no navegador continuam sendo etapas da validação manual.
