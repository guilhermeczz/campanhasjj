type Regra = { preco_venda?: number | null; pontos_por_real?: number | null; valor_por_ponto?: number | null };

export function regraProduto(produto?: Regra) {
  const preco = produto?.preco_venda ?? produto?.valor_por_ponto ?? 0;
  const pontos = produto?.preco_venda != null ? produto.pontos_por_real ?? 0 : 1;
  return { preco, pontos };
}

export function descreverRegra(produto?: Regra) {
  if (produto?.pontos_por_real != null && produto.pontos_por_real > 0) return `${produto.pontos_por_real.toLocaleString("pt-BR")} ${produto.pontos_por_real === 1 ? "ponto" : "pontos"} por R$ 1,00 vendido`;
  const { preco, pontos } = regraProduto(produto);
  return preco > 0 && pontos > 0
    ? `${preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} = ${pontos.toLocaleString("pt-BR")} ${pontos === 1 ? "ponto" : "pontos"}`
    : "Regra de pontos não configurada";
}

export function calcularPontosProduto(liquido: number, produto?: Regra): number {
  if (produto?.pontos_por_real != null) {
    const valor = Math.round(liquido * 100), fator = Math.round(produto.pontos_por_real * 100);
    if (![valor, fator].every(Number.isSafeInteger) || valor < 0 || fator <= 0) return 0;
    return Number((BigInt(valor) * BigInt(fator) + BigInt(50)) / BigInt(100)) / 100;
  }
  return calcularPontosReferencia(liquido, produto?.valor_por_ponto ?? 0, 1);
}

// Calculate the ratio using integer cents. Round only the final points, like PostgreSQL.
export function calcularPontosReferencia(liquido: number, preco: number, pontos: number): number {
  const valor = Math.round(liquido * 100), base = Math.round(preco * 100), fator = Math.round(pontos * 100);
  if (![valor, base, fator].every(Number.isSafeInteger) || valor < 0 || base <= 0 || fator <= 0) return 0;
  return Number((BigInt(valor) * BigInt(fator) * BigInt(2) + BigInt(base)) / (BigInt(base) * BigInt(2))) / 100;
}
