/** Column names in Excel; explanations stay in the app. */
export const CLIENTE_PADRAO = "NAO-INFORMADO";
/** Colunas do modelo baixado: 6 obrigatórias + data (opcional, mas recomendada). */
export const MODELO_VENDAS = ["item_id", "vendedor", "produto", "quantidade", "marca_id", "data_faturamento", "valor_bruto"] as const;
export const CAMPOS_PLANILHA = [
  { chave: "item_id", titulo: "Código do item", exemplo: "NF-12345-ITEM-1", ajuda: "Identifique cada produto da nota com um código único. Ex.: nota 12345, primeiro produto = NF-12345-ITEM-1. Use sempre o mesmo código para corrigir essa venda.", opcional: false },
  { chave: "vendedor", titulo: "Vendedor", exemplo: "joao.silva", ajuda: "Use o login, como joao.silva, em vez do nome completo. Consulte os vendedores nesta página.", opcional: false },
  { chave: "produto", titulo: "Produto", exemplo: "Conector 221", ajuda: "Informe o código ou nome de um produto cadastrado na marca. Pontos = valor líquido vendido × pontos por real do produto.", opcional: false },
  { chave: "quantidade", titulo: "Quantidade", exemplo: "10", ajuda: "Informe a quantidade deste item. Deve ser maior que zero.", opcional: false },
  { chave: "marca_id", titulo: "Código da marca", exemplo: "Consulte as marcas abaixo", ajuda: "Consulte o código da marca nesta página. Ele direciona a venda à campanha certa. Não use apenas o nome da marca.", opcional: false },
  { chave: "data_faturamento", titulo: "Data do faturamento", exemplo: "01/10/2026 09:30:00", ajuda: "Opcional: pode deixar em branco ou remover a coluna. Para uma venda nova, usamos a data de importação mostrada na revisão. Ao reenviar um item existente, mantemos sua data anterior. Para informar outra data, use dd/mm/aaaa, com horário opcional, no horário de São Paulo.", opcional: true },
  { chave: "valor_bruto", titulo: "Valor da venda (R$)", exemplo: "1000,00", ajuda: "Informe o valor total deste item antes das devoluções e cancelamentos. Ex.: 10 unidades de R$ 100 = R$ 1.000. Não repita o total da nota em cada produto.", opcional: false },
  { chave: "cliente_id", titulo: "Código do cliente", exemplo: "000123", ajuda: "Opcional: use o código do cliente no seu sistema, repetindo o mesmo código em todas as compras dele. Formate como Texto para preservar zeros. Sem essa coluna, o desempate por clientes diferentes fica neutro e a decisão vai para o faturamento geral.", opcional: true },
  { chave: "valor_devolucao", titulo: "Devolução (R$)", exemplo: "100,00", ajuda: "Preencha só se houve devolução. Informe o valor total devolvido deste item, como número positivo. Em branco significa zero.", opcional: true },
  { chave: "valor_cancelamento", titulo: "Cancelamento (R$)", exemplo: "50,00", ajuda: "Preencha só se houve cancelamento parcial. Informe o valor cancelado como número positivo e mantenha a situação faturado. Em branco significa zero.", opcional: true },
  { chave: "status", titulo: "Situação", exemplo: "faturado", ajuda: "Em branco significa faturado. Use cancelado para cancelamento total ou pendente para venda ainda não faturada. Cancelados e pendentes não somam no ranking.", opcional: true }
] as const;

export function normalizarCabecalho(valor: string): string {
  return valor.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}

export function chaveDoCabecalho(valor: string): string {
  const normalizado = normalizarCabecalho(valor);
  return CAMPOS_PLANILHA.find((campo) => normalizarCabecalho(campo.titulo) === normalizado || campo.chave === normalizado)?.chave || normalizado;
}
