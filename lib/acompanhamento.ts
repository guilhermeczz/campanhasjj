export interface EvolucaoValor {
  data: string;
  valor: number;
  acumulado: number;
}

export const formatoDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
});

export function diaFaturamento(data?: string) {
  if (!data || !Number.isFinite(new Date(data).getTime())) return "";
  const parts = formatoDia.formatToParts(new Date(data));
  return ["year", "month", "day"].map(p => parts.find(part => part.type === p)?.value).join("-");
}
