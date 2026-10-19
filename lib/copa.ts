export const PREMIOS_PADRAO = [2000, 1500, 500];

export function formatarBRL(valor: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor || 0));
}
