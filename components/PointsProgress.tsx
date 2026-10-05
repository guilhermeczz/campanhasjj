"use client";

import { useId } from "react";
import type { EvolucaoPontos } from "@/lib/acompanhamento";
import { formatarData } from "./CampaignPicker";

const numero = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export default function PointsProgress({ dados, titulo }: { dados: EvolucaoPontos[]; titulo: string }) {
  const id = useId();
  const maximo = Math.max(1, ...dados.map(d => d.acumulado));
  const inicio = Date.parse(dados[0]?.data || "2000-01-01");
  const duracao = Math.max(86400000, Date.parse(dados.at(-1)?.data || "2000-01-01") - inicio);
  const pontos = dados.map(d => ({ ...d, x: 55 + (Date.parse(d.data) - inicio) / duracao * 630, y: 155 - d.acumulado / maximo * 120 }));
  return <section className="card p-5 sm:p-6" aria-labelledby={id}>
    <h3 id={id} className="font-semibold">{titulo}</h3>
    <p className="mt-1 text-sm text-white/60">Acumulado por data de faturamento. Devoluções e correções atualizam os valores.</p>
    {dados.some(d => d.acumulado > 0) ? <>
      <svg viewBox="0 0 720 195" className="mt-4 w-full" role="img" aria-label={`Evolução de ${numero(dados[0]?.acumulado || 0)} para ${numero(dados.at(-1)?.acumulado || 0)} pontos. Valores por data disponíveis abaixo.`}>
        <line x1="55" y1="155" x2="690" y2="155" stroke="currentColor" className="text-white/20" />
        <line x1="55" y1="35" x2="690" y2="35" stroke="currentColor" className="text-white/10" strokeDasharray="4 4" />
        <text x="55" y="22" fill="currentColor" className="text-white/65" fontSize="12">{numero(maximo)} pts</text>
        <polyline points={pontos.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" className="text-jj-yellow" strokeWidth="3" strokeLinejoin="round" />
        {pontos.map(p => <circle key={p.data} cx={p.x} cy={p.y} r="4" fill="currentColor" className="text-jj-yellow"><title>{formatarData(p.data)}: {numero(p.acumulado)} pontos acumulados</title></circle>)}
        <text x="55" y="183" fill="currentColor" className="text-white/65" fontSize="12">{formatarData(dados[0]?.data || "")}</text>
        {dados.length > 1 && <text x="685" y="183" textAnchor="end" fill="currentColor" className="text-white/65" fontSize="12">{formatarData(dados.at(-1)?.data || "")}</text>}
      </svg>
      <details className="mt-3 border-t border-white/10 pt-3"><summary className="cursor-pointer text-sm text-white/75">Ver pontos por data</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="text-white/60"><th className="py-2 font-medium">Faturamento</th><th className="py-2 text-right font-medium">Pontos do dia</th><th className="py-2 text-right font-medium">Acumulado</th></tr></thead><tbody>{dados.map(d => <tr key={d.data} className="border-t border-white/10"><td className="py-2">{formatarData(d.data)}</td><td className="text-right">{numero(d.pontos)}</td><td className="text-right font-semibold text-jj-yellow">{numero(d.acumulado)}</td></tr>)}</tbody></table></div></details>
    </> : <p className="mt-5 rounded-lg bg-white/5 p-4 text-sm text-white/65">Ainda não há pontos nesta campanha. As vendas importadas aparecerão aqui.</p>}
  </section>;
}
