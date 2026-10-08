"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import AppShell from "@/components/AppShell";
import { formatarData } from "@/components/CampaignPicker";

export default function PainelVendedor() {
  const { campanhas, rankings, recarregar, loading } = useStore();
  const [selecionada, setSelecionada] = useState("");
  const [busca, setBusca] = useState("");

  const porMarca = useMemo(
    () => campanhas.filter((c) => c.tipo === "faturamento_marca" && c.marca_id && (c.ativa || rankings.some((r) => r.campanha_id === c.id))),
    [campanhas, rankings]
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return porMarca;
    return porMarca.filter((c) => c.nome.toLocaleLowerCase("pt-BR").includes(termo));
  }, [porMarca, busca]);

  useEffect(() => {
    if (!porMarca.length) { setSelecionada(""); return; }
    if (!porMarca.some((c) => c.id === selecionada)) setSelecionada(porMarca[0].id);
  }, [porMarca, selecionada]);

  const campanha = porMarca.find((c) => c.id === selecionada) || null;
  const linha = campanha ? rankings.find((r) => r.campanha_id === campanha.id) : null;
  const ativas = porMarca.filter((c) => c.ativa).length;

  return <AppShell role="vendedor" title="Minha posição" subtitle="Escolha uma campanha no menu para ver sua posição.">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-white/60">{ativas} campanhas ativas · {porMarca.length} no total</p>
      <button type="button" className="btn-ghost" disabled={loading} onClick={() => void recarregar()}>Atualizar</button>
    </div>

    {!porMarca.length ? <div className="empty-state"><h2 className="font-bold">Suas campanhas aparecerão aqui</h2><p className="mt-2 text-sm text-white/55">A diretoria está preparando as campanhas. Volte em breve para ver sua posição.</p></div> : (
      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="card p-2" aria-label="Campanhas">
          <div className="p-2"><label htmlFor="buscar-campanha-vendedor" className="sr-only">Buscar campanha</label><input id="buscar-campanha-vendedor" className="input" type="search" placeholder="Buscar campanha" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto p-2 pt-0">
            {filtradas.map((c) => {
              const pos = rankings.find((r) => r.campanha_id === c.id)?.posicao;
              const ativo = c.id === selecionada;
              return <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelecionada(c.id)}
                  aria-current={ativo ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${ativo ? "bg-jj-yellow/15 font-semibold text-white" : "text-white/75 hover:bg-white/5"}`}
                >
                  <span className="min-w-0"><span className="block truncate">{c.nome}</span>{!c.ativa && <span className="block text-xs font-normal text-white/45">Pausada</span>}</span>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${pos ? "bg-jj-yellow/20 text-jj-yellow" : "bg-white/5 text-white/50"}`}>{pos ? `${pos}º` : "—"}</span>
                </button>
              </li>;
            })}
            {filtradas.length === 0 && <li className="px-3 py-4 text-sm text-white/55">Nenhuma campanha encontrada.</li>}
          </ul>
        </nav>

        <section className="card p-5" aria-live="polite" aria-label={campanha ? `Sua posição em ${campanha.nome}` : "Posição"}>
          {!campanha ? <p className="text-sm text-white/60">Selecione uma campanha no menu.</p> : <>
            <p className="section-eyebrow">{campanha.nome}</p>
            <p className="mt-1 text-xs text-white/50">{formatarData(campanha.data_inicio)} a {formatarData(campanha.data_fim)}</p>
            {linha
              ? <p className="mt-4 text-5xl font-semibold tracking-tight text-jj-yellow">{linha.posicao}º <span className="text-base font-normal text-white/60">lugar</span></p>
              : <p className="mt-4 text-lg font-semibold text-white/70">Ainda sem posição</p>}
            <p className="mt-2 text-xs leading-5 text-white/55">{linha ? "Sua colocação atual nesta campanha." : "Sua posição aparece aqui quando suas vendas válidas entrarem no ranking."}</p>
          </>}
        </section>
      </div>
    )}
  </AppShell>;
}
