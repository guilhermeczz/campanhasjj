"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import AppShell from "@/components/AppShell";
import CampaignPicker from "@/components/CampaignPicker";
import CopaRanking from "@/components/CopaRanking";
import TeamProgress from "@/components/TeamProgress";

export default function AdminDashboard() {
  const { campanhas, rankings, vendas_total, recarregar, loading, campanhaSelecionada, setCampanhaSelecionada } = useStore();
  const porMarca = campanhas.filter((c) => c.tipo === "faturamento_marca" && c.marca_id);
  const campanha = porMarca.find((c) => c.id === campanhaSelecionada);
  
  return <AppShell role="admin" title="Acompanhamento das campanhas" subtitle="Consulte os pontos da equipe e a evolução de cada vendedor por campanha.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-white/60">{porMarca.filter((c) => c.ativa).length} campanhas ativas</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={loading} onClick={() => void recarregar()}>Atualizar resultados</button><Link href="/admin/upload" className="btn-primary">Importar vendas</Link></div></div>
    {!porMarca.length ? <div className="empty-state"><h2 className="text-lg font-bold">Prepare sua primeira campanha</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">Escolha uma marca, o período de faturamento e os prêmios. Depois, importe a planilha de vendas para acompanhar os resultados.</p><Link href="/admin/campanhas" className="btn-primary mt-5">Criar campanha</Link></div> : <div className="space-y-5"><CampaignPicker campanhas={porMarca} value={campanhaSelecionada} onChange={setCampanhaSelecionada} />{campanha && <><p className="text-xs text-white/55">{vendas_total.toLocaleString("pt-BR")} vendas registradas no total.</p><TeamProgress key={campanha.id} campanha={campanha} /><details className="card p-5" open><summary className="cursor-pointer font-semibold">Classificação e prêmios por faturamento</summary><div className="mt-5"><CopaRanking campanha={campanha} linhas={rankings.filter((r) => r.campanha_id === campanha.id)} /></div></details></>}</div>}
  </AppShell>;
}
