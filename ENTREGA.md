# Entrega do Campanhas JJ

## O que está pronto

- Produtos com código, preço de catálogo e multiplicador de pontos por real.
- Vendas: planilha com uma aba, cabeçalhos prontos, revisão antes de confirmar e atualização por Código do item.
- Diretoria: pontos de todos os vendedores, inclusive zerados, busca, evolução por data e classificação por faturamento em seção separada.
- Vendedor: somente seus pontos, evolução e vendas. A privacidade é aplicada no banco.
- Exclusão de vendedor com confirmação vermelha e preservação das vendas.
- Exclusão de produto com confirmação vermelha: sai do catálogo, bloqueia novas vendas com aquele nome/código e preserva vendas, pontos e histórico. O mesmo nome/código pode ser recadastrado como novo produto.
- Auditoria exclusiva do administrador, com responsável, horário, resultado e prévia de cada importação de vendas concluída.
- Desfazer a última importação, com confirmação vermelha: remove novas vendas, restaura atualizadas e registra quem desfez.

## Supabase

A última `migration_backend_seguro.sql` já foi aplicada, conforme confirmado em 05/10/2026. **Para ativar o painel otimizado (novo carregamento leve do painel da diretoria), execute agora o conteúdo completo de `supabase/migration_bootstrap_leve.sql` no SQL Editor do mesmo Supabase, depois das demais migrações.** Ela preserva vendas, cadastros e auditoria. Se o diagnóstico (`npm run check:supabase`) indicar funções pendentes, execute antes `supabase/migration_auditoria_importacoes.sql` (auditoria/desfazer) e `supabase/migration_exclusao_produtos.sql` (`jj_excluir_produto`) — ambas preservam vendas, auditoria e a importação. Não é necessário reaplicar o backend nem os scripts iniciais. Sem essa migração, o painel mostra o aviso "Falta ativar o painel otimizado".

A migração preserva as vendas e os cadastros. O histórico começa nas próximas importações concluídas; arquivos antigos não são reconstruídos. O app atualizado depende dessa migração para importar vendas.

## Auditoria e desfazer

Na aba **Auditoria**, busque o arquivo ou responsável e clique em **Ver prévia**. Os dados são os valores normalizados gravados no envio, com pontos calculados pelo banco; o Excel original, suas fórmulas e formatação não são armazenados. Arquivos rejeitados não entram nesse histórico de importações concluídas. A prévia permanece igual mesmo após correções ou reversão.

O botão vermelho **Desfazer importação** aparece somente na última importação concluída. A confirmação mostra quantas vendas serão removidas e quantas voltarão ao estado anterior. Pontos e ranking refletem a restauração. O histórico registra data e administrador da reversão. Uma nova importação substitui a possibilidade de desfazer a anterior; desfazer não libera reversões em sequência. Para refazer, importe o arquivo novamente.

Se as vendas ou os produtos/campanhas envolvidos forem alterados depois, a reversão será bloqueada para preservar essas alterações. Nesse caso, importe os itens corrigidos com os mesmos códigos. Uma tentativa de importação que falha não perde a reserva anterior.

Economia de banco: prévias compactas, reaproveitamento de conteúdo idêntico, consultas paginadas e apenas uma reserva de restauração. No teste local de 339 vendas, uma prévia ocupou aproximadamente 10 KB e a reserva de reimportação, 41 KB. Esses valores excluem índices/metadados e variam conforme o conteúdo. O histórico cresce com novos conteúdos; não há exclusão automática.

### Teste específico da nova função

1. Após executar a migração, importar uma venda de teste de R$ 100 com fator 1,5. Conferir 150 pontos e a prévia na Auditoria.
2. Reimportar o mesmo item com R$ 80 e incluir um novo item de teste. Conferir que aparece outro registro.
3. Abrir Desfazer importação e escolher Manter importação: nada deve mudar.
4. Reabrir e confirmar: o primeiro item deve voltar a R$ 100/150 pontos e o item novo deve desaparecer. Conferir painel, ranking e histórico marcado como Desfeita.
5. Confirmar que o botão não permite desfazer novamente e que a prévia da importação desfeita continua consultável.
6. Entrar como vendedor: nenhum menu de auditoria e nenhum acesso a `/admin/auditoria` ou às suas APIs.
7. Testar a consulta e a confirmação também no celular. Use códigos exclusivamente de teste; ao terminar, cancele o primeiro item de teste por reimportação para retirar sua contribuição.

## Preparar os cadastros

1. Entrar como diretoria em http://127.0.0.1:3000/login.
2. Conferir a marca AMANCO e sua campanha: datas, situação e premiação.
3. Em Produtos, selecionar AMANCO e importar `vendas_e_nf-e_528186446572103.xlsx`. Revisar os 339 produtos e confirmar. O arquivo foi testado localmente; sua importação no banco real ainda depende dessa confirmação na aplicação.
4. Cadastrar os usuários definitivos em Vendedores, como você decidiu. O acesso de diretoria é o usado pelo cliente para importar e acompanhar todos.
5. Conferir outras marcas e campanhas que participarão. Não foram criadas campanhas com regras inventadas.

O cliente precisará atualizar cadastros somente quando surgir um novo produto, vendedor ou campanha. No uso diário, basta importar vendas.

## Testar antes da entrega

Use uma campanha e um vendedor destinados à validação. O teste abaixo grava vendas no banco conectado; não use códigos de notas reais para vendas simuladas. Ao terminar, reenvie os mesmos itens com Situação = cancelado para zerar a contribuição dos testes, preservando o registro.

1. Baixar o modelo em Importar vendas. Deve abrir apenas a aba Vendas, com as 7 colunas.
2. Preencher um item de R$ 100 para um produto com fator 1,5, quantidade 1, um vendedor ativo, código de item exclusivo e data dentro da campanha (cliente é opcional).
3. Revisar e confirmar. Diretoria deve mostrar 150 pontos para esse vendedor; outro vendedor sem vendas deve aparecer com zero.
4. Clicar em Ver evolução. O acumulado deve ser 150 na data do faturamento. O total geral e o filtro individual precisam coincidir quando apenas esse vendedor tiver vendas.
5. Reenviar exatamente o mesmo Código do item: deve atualizar, sem virar 300 pontos.
6. Reenviar o item com Devolução = 20: líquido de R$ 80 e 120 pontos. Reenviar como cancelado: contribuição zero.
7. Entrar como vendedor em outra janela: somente a posição em cada campanha, sem pontos, valores ou vendas. A diretoria continua vendo tudo.
8. Testar em celular: seleção da campanha, busca de vendedor, gráfico, revisão da planilha e confirmação.

A evolução usa a data do faturamento e os valores atuais das vendas. Correções refazem a curva; ela não é um histórico das versões de cada upload.

## Publicar como campanhasjj na Vercel

Você fará a publicação. A compilação local já foi validada. O projeto usa Next.js e o comando de build é `npm run build`; mantenha a saída padrão do framework.

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

Abra o endereço HTTPS retornado e repita login, download do modelo e o teste de importação. O endereço final depende da disponibilidade na Vercel. [Fluxo oficial de publicação pela CLI](https://vercel.com/docs/projects/deploy-from-cli).

## Verificações executáveis

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check:supabase
```

Para executar localmente após fechar o servidor: `npm.cmd run dev`. Com ele aberto, `node scripts/check-http.mjs` verifica páginas e proteção das APIs sem alterar cadastros.

Testes de banco executam em memória; não modificam o Supabase real. Revisão visual e importação autenticada no navegador continuam sendo etapas da validação manual, pois não há navegador conectado nesta sessão.

Validação concluída: 91 testes aprovados e compilação de produção aprovada. A nova suíte `test/auditoria.test.mjs` verifica isolamento, prévias, paginação até 5.000 linhas, reaplicação da migração e restauração transacional; `test/backend.test.mjs` cobre exclusão de produto com preservação de vendas. HTTP: 10 páginas disponíveis e 7 operações de API protegidas. Os 339 produtos do arquivo real passaram por cadastro e reimportação em banco temporário, com totais, evolução, auditoria e reversão conferidos contra o PostgreSQL. Nenhuma importação ou migração foi executada no Supabase real nesta etapa.
