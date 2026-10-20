"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import AppShell from "@/components/AppShell";
import CampaignPicker from "@/components/CampaignPicker";
import CopaRanking, { dinheiro } from "@/components/CopaRanking";
import EvolucaoCampanha from "@/components/EvolucaoCampanha";

export default function AdminDashboard() {
  const { campanhas, rankings, vendas_total, recarregar, loading, campanhaSelecionada, setCampanhaSelecionada } = useStore();
  const [categoria, setCategoria] = useState("");

  const campanha = campanhas.find((c) => c.id === campanhaSelecionada) ?? campanhas.find((c) => c.ativa) ?? campanhas[0];
  const doCampanha = useMemo(() => campanha ? rankings.filter((r) => r.campanha_id === campanha.id) : [], [campanha, rankings]);
  const categoriasDisponiveis = useMemo(
    () => [...new Set(doCampanha.map((r) => r.categoria_nome))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [doCampanha]
  );
  const linhasVisiveis = useMemo(
    () => categoria ? doCampanha.filter((r) => r.categoria_nome === categoria) : doCampanha,
    [categoria, doCampanha]
  );
  const totalCategoria = linhasVisiveis.reduce((soma, r) => soma + r.total_vendido, 0);
  const lideres = linhasVisiveis.filter((r) => r.posicao === 1);
  const nomeLider = lideres.map((r) => r.vendedor_nome).join(" / ");

  useEffect(() => {
    if (categoria && !categoriasDisponiveis.includes(categoria)) setCategoria("");
  }, [categoria, categoriasDisponiveis]);

  function trocarCampanha(id: string) {
    setCampanhaSelecionada(id);
    setCategoria("");
  }

  return <AppShell role="admin" title="Acompanhamento das campanhas" subtitle="O ranking é por categoria. Cada venda soma no ranking da categoria do vendedor.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-white/60">{campanhas.filter((c) => c.ativa).length} campanhas ativas</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={loading} onClick={() => void recarregar()}>Atualizar resultados</button><Link href="/admin/upload" className="btn-primary">Importar vendas</Link></div></div>
    {!campanhas.length ? <div className="empty-state"><h2 className="text-lg font-bold">Prepare sua primeira campanha</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">Defina o período de faturamento e os prêmios. Depois, importe a planilha de vendas para acompanhar os resultados.</p><Link href="/admin/campanhas" className="btn-primary mt-5">Criar campanha</Link></div> : <div className="space-y-5">
      <CampaignPicker campanhas={campanhas} value={campanha?.id ?? campanhaSelecionada} onChange={trocarCampanha} />
      {campanha && <>
        <p className="text-xs text-white/55">{categoriasDisponiveis.length} {categoriasDisponiveis.length === 1 ? "categoria" : "categorias"} com vendas · {vendas_total.toLocaleString("pt-BR")} vendas registradas no total.</p>
        <section className="card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-bold">{categoria ? `Ranking da categoria ${categoria}` : "Visão geral por categoria"}</h2>
              <p className="mt-1 text-sm text-white/60">{categoria ? "Veja quem está à frente nesta categoria." : "Cada categoria tem seu próprio ranking e premiação. Não há ranking geral."}</p>
            </div>
            <div className="w-full sm:w-72">
              <label htmlFor="categoria-visao" className="field-label">Categoria da visão geral</label>
              <select id="categoria-visao" className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Todas as categorias</option>
                {categoriasDisponiveis.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
              </select>
            </div>
          </div>
          {categoria && <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-white/55">Total vendido</p><p className="mt-1 text-lg font-semibold text-jj-yellow">{dinheiro(totalCategoria)}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-white/55">Vendedores no ranking</p><p className="mt-1 text-lg font-semibold">{linhasVisiveis.length}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-white/55">{lideres.length > 1 ? "Líderes" : "Líder"}</p><p className="mt-1 truncate text-sm font-semibold" title={nomeLider}>{nomeLider || "—"}</p><p className="text-xs text-white/55">{lideres.length ? dinheiro(lideres[0].total_vendido) : ""}</p></div>
          </div>}
          <div className="mt-5"><CopaRanking campanha={campanha} linhas={linhasVisiveis} /></div>
        </section>
        <EvolucaoCampanha key={`ev-${campanha.id}`} campanha={campanha} />
      </>}
    </div>}
  </AppShell>;
}
