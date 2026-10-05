import type { Campanha } from "@/lib/types";

export function formatarData(data: string) {
  const value = data?.slice(0, 10).split("-");
  return value?.length === 3 ? `${value[2]}/${value[1]}/${value[0]}` : "—";
}

export default function CampaignPicker({ campanhas, value, onChange }: {
  campanhas: Campanha[]; value: string; onChange: (id: string) => void;
}) {
  const campanha = campanhas.find((c) => c.id === value);
  return <section className="card p-4 sm:p-5" aria-label="Escolher campanha"><div className="grid items-center gap-4 sm:grid-cols-[minmax(220px,1fr)_auto]"><div><label htmlFor="campanha-selecionada" className="field-label">Qual campanha você quer acompanhar?</label><select id="campanha-selecionada" className="input font-semibold" value={value} onChange={(e) => onChange(e.target.value)}>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}{!c.ativa ? " · Pausada" : ""}</option>)}</select></div>{campanha && <div className="text-sm"><p className="text-xs text-white/60">Período de faturamento</p><p className="mt-1 font-medium">{formatarData(campanha.data_inicio)} <span className="text-white/55">a</span> {formatarData(campanha.data_fim)}</p></div>}</div></section>;
}
