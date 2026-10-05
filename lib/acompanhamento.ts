import type { Campanha, Venda, VendedorFull } from "./types";

export interface EvolucaoPontos { data: string; pontos: number; acumulado: number }
export interface ProgressoVendedor {
  id: string; nome: string; username: string; ativo: boolean; excluido: boolean;
  pontos: number; liquido: number; itens: number; ultimaVenda: string;
}
const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export function diaFaturamento(data?: string) {
  if (!data || !Number.isFinite(new Date(data).getTime())) return "";
  const parts = formatoDia.formatToParts(new Date(data));
  return ["year", "month", "day"].map(p => parts.find(part => part.type === p)?.value).join("-");
}
export function vendasDaCampanha(campanha: Campanha, vendas: Venda[]) {
  return vendas.filter(v => {
    const dia = diaFaturamento(v.data_faturamento);
    return v.marca_id === campanha.marca_id && dia && dia >= campanha.data_inicio && dia <= campanha.data_fim;
  });
}

// Points are already calculated by PostgreSQL. Here we only group saved results for display.
export function acompanharCampanha(campanha: Campanha, vendas: Venda[], vendedores: VendedorFull[]) {
  const itens = vendasDaCampanha(campanha, vendas);
  const equipe = new Map<string, ProgressoVendedor>();
  for (const v of vendedores.filter(v => v.role === "vendedor")) equipe.set(v.id, {
    id: v.id, nome: v.nome, username: v.username, ativo: v.ativo, excluido: false,
    pontos: 0, liquido: 0, itens: 0, ultimaVenda: "",
  });
  for (const v of itens) {
    if (!v.vendedor_id) continue;
    if (!equipe.has(v.vendedor_id)) equipe.set(v.vendedor_id, {
      id: v.vendedor_id, nome: v.vendedor_nome || v.vendedor, username: v.vendedor, ativo: false, excluido: true,
      pontos: 0, liquido: 0, itens: 0, ultimaVenda: "",
    });
    const resumo = equipe.get(v.vendedor_id)!;
    if (v.status !== "faturado") continue;
    resumo.pontos += Math.round(Number(v.pontos || 0) * 100);
    resumo.liquido += Math.round(Number(v.valor_bruto || 0) * 100) - Math.round(Number(v.valor_devolucao || 0) * 100) - Math.round(Number(v.valor_cancelamento || 0) * 100);
    resumo.itens++;
    const dia = diaFaturamento(v.data_faturamento);
    if (dia > resumo.ultimaVenda) resumo.ultimaVenda = dia;
  }
  return [...equipe.values()].map(v => ({ ...v, pontos: v.pontos / 100, liquido: v.liquido / 100 }))
    .sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
}

export function evolucaoCampanha(campanha: Campanha, vendas: Venda[], vendedorId = ""): EvolucaoPontos[] {
  const dias = new Map<string, number>([[campanha.data_inicio, 0]]);
  for (const v of vendasDaCampanha(campanha, vendas)) {
    if (v.status !== "faturado" || (vendedorId && v.vendedor_id !== vendedorId)) continue;
    const dia = diaFaturamento(v.data_faturamento);
    dias.set(dia, (dias.get(dia) || 0) + Math.round(Number(v.pontos || 0) * 100));
  }
  let acumulado = 0;
  return [...dias].sort(([a],[b]) => a.localeCompare(b)).map(([data, centesimos]) => {
    acumulado += centesimos;
    return { data, pontos: centesimos / 100, acumulado: acumulado / 100 };
  });
}
