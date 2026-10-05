/** Column names in Excel; explanations stay in the app. */
export const CAMPOS_PLANILHA = [
  { chave: "item_id", titulo: "Código do item", exemplo: "NF-12345-ITEM-1", ajuda: "Identifique cada produto da nota com um código único. Ex.: nota 12345, primeiro produto = NF-12345-ITEM-1. Use sempre o mesmo código para corrigir essa venda.", opcional: false },
  { chave: "vendedor", titulo: "Vendedor", exemplo: "joao.silva", ajuda: "Use o login, como joao.silva, em vez do nome completo. Consulte os vendedores nesta página.", opcional: false },
  { chave: "produto", titulo: "Produto", exemplo: "Conector 221", ajuda: "Informe o código ou nome de um produto cadastrado na marca. Pontos = valor líquido vendido × pontos por real do produto.", opcional: false },
  { chave: "quantidade", titulo: "Quantidade", exemplo: "10", ajuda: "Informe a quantidade deste item. Deve ser maior que zero.", opcional: false },
  { chave: "marca_id", titulo: "Código da marca", exemplo: "Consulte as marcas abaixo", ajuda: "Consulte o código da marca nesta página. Ele direciona a venda à campanha certa. Não use apenas o nome da marca.", opcional: false },
  { chave: "data_faturamento", titulo: "Data do faturamento", exemplo: "01/10/2026 09:30:00", ajuda: "Opcional: pode deixar em branco ou remover a coluna. Para uma venda nova, usamos a data de importação mostrada na revisão. Ao reenviar um item existente, mantemos sua data anterior. Para informar outra data, use dd/mm/aaaa, com horário opcional, no horário de São Paulo.", opcional: true },
  { chave: "valor_bruto", titulo: "Valor da venda (R$)", exemplo: "1000,00", ajuda: "Informe o valor total deste item antes das devoluções e cancelamentos. Ex.: 10 unidades de R$ 100 = R$ 1.000. Não repita o total da nota em cada produto.", opcional: false },
  { chave: "cliente_id", titulo: "Código do cliente", exemplo: "000123", ajuda: "Use o código do cliente no seu sistema. O mesmo cliente deve ter o mesmo código em todas as compras. Formate como Texto para preservar zeros.", opcional: false },
  { chave: "valor_devolucao", titulo: "Devolução (R$)", exemplo: "100,00", ajuda: "Preencha só se houve devolução. Informe o valor total devolvido deste item, como número positivo. Em branco significa zero.", opcional: true },
  { chave: "valor_cancelamento", titulo: "Cancelamento (R$)", exemplo: "50,00", ajuda: "Preencha só se houve cancelamento parcial. Informe o valor cancelado como número positivo e mantenha a situação faturado. Em branco significa zero.", opcional: true },
  { chave: "status", titulo: "Situação", exemplo: "faturado", ajuda: "Em branco significa faturado. Use cancelado para cancelamento total ou pendente para venda ainda não faturada. Cancelados e pendentes não somam no ranking.", opcional: true }
] as const;

export const DUVIDAS_IMPORTACAO = [
  { pergunta: "Preciso preencher a data do faturamento?", resposta: "Não. Você pode deixar as células vazias ou remover a coluna. Vendas novas usam a data da importação; itens já cadastrados mantêm a data anterior. A revisão mostra a data usada e a campanha antes da confirmação. Se preencher uma data, ela precisa ser válida e será usada no lugar da automática." },
  { pergunta: "Como são calculados os pontos e o ranking?", resposta: "Pontos = valor líquido vendido × fator do produto. R$ 100 × 1 = 100 pontos. R$ 100 × 1,5 = 150 pontos. O preço do catálogo é apenas referência. Devoluções e cancelamentos reduzem o valor usado. A classificação e os prêmios continuam pelo faturamento líquido." },
  { pergunta: "O produto não foi encontrado. Como cadastro ou altero os pontos?", resposta: "Abra Produtos no menu. Cadastre manualmente ou importe Descrição, Código, Preço Venda e pontos x R$. Selecione a marca no site quando ela não estiver na planilha. Alterar o fator de pontos recalcula as vendas vinculadas." },
  { pergunta: "Posso colocar vários vendedores e marcas na mesma planilha?", resposta: "Sim. Coloque uma linha para cada produto de cada nota. O sistema separa as vendas pelo vendedor, pela marca e pela data de faturamento. Você não precisa criar um arquivo por campanha." },
  { pergunta: "Como o sistema sabe qual é a campanha?", resposta: "Pelo código da marca e pela data de faturamento. Consulte o código nesta página. A revisão mostra a campanha de cada linha antes de você confirmar. Não precisa preencher o nome da campanha." },
  { pergunta: "Uma nota tem três produtos. Como preencho?", resposta: "Crie três linhas, uma por produto, com códigos diferentes: NF-123-ITEM-1, NF-123-ITEM-2 e NF-123-ITEM-3. Repita vendedor, cliente e data quando forem os mesmos. Informe o valor de cada item, sem repetir o valor total da nota." },
  { pergunta: "Posso deixar devolução, cancelamento e situação em branco?", resposta: "Sim. Devolução e cancelamento em branco valem zero. Situação em branco significa faturado. Preencha esses campos apenas quando precisar registrar uma exceção." },
  { pergunta: "Preciso informar o preço unitário ou o total?", resposta: "Informe o total do item na coluna Valor da venda (R$). Por exemplo: 10 produtos de R$ 100 devem ser informados como quantidade 10 e valor da venda 1000,00. O sistema não multiplica esse valor pela quantidade." },
  { pergunta: "Como registro uma devolução ou corrijo uma venda?", resposta: "Reenvie o mesmo Código do item, com os dados completos e os valores acumulados atualizados. Ex.: venda de R$ 1.000 com R$ 100 devolvidos: mantenha a venda em 1000,00 e informe devolução 100,00. O líquido será R$ 900. Não crie uma venda negativa nem desconte duas vezes." },
  { pergunta: "Como registro cancelamento total ou parcial?", resposta: "Para cancelamento total, use situação cancelado: o item deixa de somar. Para cancelamento parcial, use faturado e informe apenas a parte cancelada em Cancelamento (R$). Devolução e cancelamento juntos não podem superar o valor da venda." },
  { pergunta: "Se eu enviar a planilha duas vezes, duplica?", resposta: "Não, desde que mantenha o mesmo Código do item: o envio atualiza o registro anterior. Um código novo cria um item novo. Evite repetir um código em duas linhas do mesmo arquivo." },
  { pergunta: "Não achei a marca ou o vendedor. O que faço?", resposta: "Cadastre a marca ou o vendedor no menu antes de importar. Use o login de um vendedor ativo e o código da marca, disponíveis na consulta desta página." },
  { pergunta: "O que significam Somente desempate e Fora do período?", resposta: "Somente desempate indica que a venda não tem uma campanha ativa para aquela marca, mas entra no faturamento geral usado para desempatar. Fora do período indica que a data não está no período de nenhuma campanha ativa. Esses itens são guardados, mas não geram uma classificação própria." },
  { pergunta: "Posso enviar direto a planilha do meu sistema?", resposta: "Use a aba Vendas com os mesmos cabeçalhos do modelo. Copie e cole somente os valores do seu relatório nas colunas correspondentes. O arquivo deve ser .xlsx, ter até 5 MB e no máximo 5.000 linhas. Fórmulas não são aceitas." },
  { pergunta: "Apareceu um erro. Alguma venda já foi salva?", resposta: "Selecionar o arquivo apenas confere os dados. Nada é salvo até você clicar em Confirmar importação. Se alguma linha estiver inválida, todo o envio fica bloqueado: corrija as linhas indicadas no Excel, salve e selecione o arquivo novamente." }
] as const;

export function normalizarCabecalho(valor: string): string {
  return valor.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}

export function chaveDoCabecalho(valor: string): string {
  const normalizado = normalizarCabecalho(valor);
  return CAMPOS_PLANILHA.find((campo) => normalizarCabecalho(campo.titulo) === normalizado || campo.chave === normalizado)?.chave || normalizado;
}
