"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import AppShell from "@/components/AppShell";
import CampaignPicker from "@/components/CampaignPicker";
import CopaRanking from "@/components/CopaRanking";
import PointsProgress from "@/components/PointsProgress";
import { evolucaoCampanha } from "@/lib/acompanhamento";

export default function PainelVendedor() {
  const { user } = useAuth();
  const { campanhas, rankings, pontuacoes, vendas, recarregar, loading } = useStore();
  const [selecionada, setSelecionada] = useState("");
  const minhasLinhas = rankings.filter((r) => r.vendedor_id === user?.id);
  const porMarca = campanhas.filter((c) => c.tipo === "faturamento_marca" && c.marca_id && (c.ativa || minhasLinhas.some((r) => r.campanha_id === c.id)));
  const campanha = porMarca.find((c) => c.id === selecionada) || porMarca.find((c) => minhasLinhas.some((r) => r.campanha_id === c.id)) || porMarca[0];
  const meusPontos = pontuacoes.find((p) => p.campanha_id === campanha?.id && p.vendedor_id === user?.id)?.total_pontos || 0;
  return <AppShell role="vendedor" title="Minhas campanhas" subtitle="Consulte somente seus pontos e resultados. A classificação e os prêmios seguem o faturamento líquido.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-white/60">Seus resultados são visíveis apenas para você e a diretoria.</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={loading} onClick={() => void recarregar()}>Atualizar meus pontos</button><Link href="/painel/vendas" className="btn-ghost">Conferir minhas vendas</Link></div></div>
    {!campanha ? <div className="empty-state"><h2 className="font-bold">Suas campanhas aparecerão aqui</h2><p className="mt-2 text-sm text-white/55">A diretoria está preparando as campanhas. Acompanhe por aqui assim que estiverem disponíveis.</p></div> : <div className="space-y-5"><CampaignPicker campanhas={porMarca} value={campanha.id} onChange={setSelecionada} /><section className="card border-jj-yellow/25 p-5 sm:p-6" aria-label="Minha pontuação"><p className="section-eyebrow">Meus pontos em {campanha.nome}</p><p className="mt-3 text-4xl font-semibold tracking-tight text-jj-yellow">{meusPontos.toLocaleString("pt-BR")} <span className="text-base font-normal">pontos</span></p><p className="mt-3 text-sm leading-6 text-white/65">Valor líquido vendido multiplicado pelo fator de cada produto. Somente sua pontuação aparece nesta área.</p></section><PointsProgress dados={evolucaoCampanha(campanha, vendas, user?.id)} titulo="Minha evolução de pontos" /><CopaRanking campanha={campanha} linhas={minhasLinhas.filter((r) => r.campanha_id === campanha.id)} apenasVendedor /></div>}
  </AppShell>;
}
