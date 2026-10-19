/** Colunas do modelo baixado: as três colunas obrigatórias da planilha de vendas. */
export const MODELO_VENDAS = ["vendedor", "valor_vendido", "categoria"] as const;

export const CAMPOS_PLANILHA = [
  {
    chave: "vendedor",
    titulo: "Vendedor",
    exemplo: "joao.silva",
    ajuda: "Use o nome ou o login do vendedor cadastrado. Consulte a lista de vendedores nesta página. Cada linha representa uma venda de um vendedor.",
    opcional: false
  },
  {
    chave: "valor_vendido",
    titulo: "Valor Vendido",
    exemplo: "1000,00",
    ajuda: "Informe o valor vendido nesta linha, em reais, maior ou igual a zero e com até duas casas decimais. O ranking soma o valor vendido de cada vendedor.",
    opcional: false
  },
  {
    chave: "categoria",
    titulo: "Categoria",
    exemplo: "Tubos",
    ajuda: "Informe o nome de uma categoria já cadastrada. Categorias não cadastradas bloqueiam a importação; cadastre-as antes em Categorias.",
    opcional: false
  }
] as const;

export function normalizarCabecalho(valor: string): string {
  return valor.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}

export function chaveDoCabecalho(valor: string): string {
  const normalizado = normalizarCabecalho(valor);
  return CAMPOS_PLANILHA.find((campo) => normalizarCabecalho(campo.titulo) === normalizado || campo.chave === normalizado)?.chave || normalizado;
}
