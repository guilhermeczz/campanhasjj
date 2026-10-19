"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import AppShell from "@/components/AppShell";
import CampaignPicker from "@/components/CampaignPicker";
import CopaRanking from "@/components/CopaRanking";
import EvolucaoCampanha from "@/components/EvolucaoCampanha";

export default function AdminDashboard() {
  const { campanhas, rankings, vendas_total, recarregar, loading, campanhaSelecionada, setCampanhaSelecionada } = useStore();
  const campanha = campanhas.find((c) => c.id === campanhaSelecionada);
  const doCampanha = campanha ? rankings.filter((r) => r.campanha_id === campanha.id) : [];
  const categorias = new Set(doCampanha.map((r) => r.categoria_nome)).size;

  return <AppShell role="admin" title="Acompanhamento das campanhas" subtitle="O ranking é por categoria. Cada venda soma no ranking da categoria do vendedor.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-white/60">{campanhas.filter((c) => c.ativa).length} campanhas ativas</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={loading} onClick={() => void recarregar()}>Atualizar resultados</button><Link href="/admin/upload" className="btn-primary">Importar vendas</Link></div></div>
    {!campanhas.length ? <div className="empty-state"><h2 className="text-lg font-bold">Prepare sua primeira campanha</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">Defina o período de faturamento e os prêmios. Depois, importe a planilha de vendas para acompanhar os resultados.</p><Link href="/admin/campanhas" className="btn-primary mt-5">Criar campanha</Link></div> : <div className="space-y-5"><CampaignPicker campanhas={campanhas} value={campanhaSelecionada} onChange={setCampanhaSelecionada} />{campanha && <><p className="text-xs text-white/55">{categorias} {categorias === 1 ? "categoria" : "categorias"} com vendas · {vendas_total.toLocaleString("pt-BR")} vendas registradas no total.</p><section className="card p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold">Ranking por categoria</h2><p className="mt-1 text-sm text-white/60">Cada categoria tem seu próprio ranking e premiação. Não há ranking geral.</p></div></div><div className="mt-5"><CopaRanking campanha={campanha} linhas={doCampanha} /></div></section><EvolucaoCampanha key={`ev-${campanha.id}`} campanha={campanha} /></>}</div>}
  </AppShell>;
}
