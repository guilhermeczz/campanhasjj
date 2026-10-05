"use client";

import { useStore } from "@/lib/store";
import AppShell from "@/components/AppShell";

export default function PainelVendedor() {
  const { campanhas, rankings, recarregar, loading } = useStore();
  const porMarca = campanhas.filter((c) => c.tipo === "faturamento_marca" && c.marca_id && (c.ativa || rankings.some((r) => r.campanha_id === c.id)));
  return <AppShell role="vendedor" title="Minha posição" subtitle="Você vê apenas sua posição em cada campanha. Pontos e valores são visíveis somente para a diretoria.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-white/60">{porMarca.filter((c) => c.ativa).length} campanhas ativas</p><button type="button" className="btn-ghost" disabled={loading} onClick={() => void recarregar()}>Atualizar minha posição</button></div>
    {!porMarca.length ? <div className="empty-state"><h2 className="font-bold">Suas campanhas aparecerão aqui</h2><p className="mt-2 text-sm text-white/55">A diretoria está preparando as campanhas. Volte em breve para ver sua posição.</p></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{porMarca.map((campanha) => {
      const linha = rankings.find((r) => r.campanha_id === campanha.id);
      return <section key={campanha.id} className="card border-jj-yellow/25 p-5 sm:p-6" aria-label={`Sua posição em ${campanha.nome}`}>
        <p className="section-eyebrow">{campanha.nome}</p>
        {linha ? <p className="mt-3 text-4xl font-semibold tracking-tight text-jj-yellow">{linha.posicao}º <span className="text-base font-normal text-white/60">lugar</span></p>
          : <p className="mt-3 text-lg font-semibold text-white/70">Ainda sem posição</p>}
        <p className="mt-3 text-xs leading-5 text-white/55">{linha ? "Sua colocação atual nesta campanha." : "Sua posição aparece aqui quando suas vendas válidas entrarem no ranking."}</p>
      </section>;
    })}</div>}
  </AppShell>;
}
