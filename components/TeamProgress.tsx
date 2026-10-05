"use client";

import { useMemo, useState } from "react";
import type { Campanha, Venda, VendedorFull } from "@/lib/types";
import { acompanharCampanha, evolucaoCampanha } from "@/lib/acompanhamento";
import PointsProgress from "./PointsProgress";
import { formatarData } from "./CampaignPicker";
import { dinheiro } from "./CopaRanking";

export default function TeamProgress({ campanha, vendas, vendedores }: { campanha: Campanha; vendas: Venda[]; vendedores: VendedorFull[] }) {
  const [busca, setBusca] = useState("");
  const [vendedor, setVendedor] = useState("");
  const equipe = useMemo(() => acompanharCampanha(campanha, vendas, vendedores), [campanha, vendas, vendedores]);
  const selecionado = equipe.find(v => v.id === vendedor);
  const evolucao = useMemo(() => evolucaoCampanha(campanha, vendas, selecionado?.id), [campanha, vendas, selecionado?.id]);
  const lista = equipe.filter(v => `${v.nome} ${v.username}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  const total = equipe.reduce((s,v) => s + Math.round(v.pontos * 100), 0) / 100;
  const comPontos = equipe.filter(v => v.pontos > 0).length;
  return <section aria-label="Acompanhamento dos vendedores" className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">{[
      ["Pontos da campanha", total.toLocaleString("pt-BR")], ["Vendedores com pontos", String(comPontos)], ["Vendedores sem pontos", String(equipe.length - comPontos)],
    ].map(([titulo, valor]) => <div key={titulo} className="card p-5"><p className="text-sm text-white/65">{titulo}</p><p className="mt-2 text-3xl font-semibold text-jj-yellow">{valor}</p></div>)}</div>
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Pontos de cada vendedor</h2><p className="mt-1 text-sm text-white/60">Todos os vendedores, inclusive quem ainda está zerado. Ordem alfabética.</p></div><div className="w-full sm:w-64"><label htmlFor="buscar-progresso" className="field-label">Buscar vendedor</label><input id="buscar-progresso" className="input" type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou login" /></div></div>
      <div className="mt-5 space-y-2">{lista.map(v => <article key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div className="min-w-0"><h3 className="break-words font-semibold">{v.nome}</h3><p className="mt-1 text-xs text-white/60">{v.excluido ? "Acesso excluído · histórico preservado" : !v.ativo ? "Acesso inativo" : v.username}{v.ultimaVenda ? ` · Última venda: ${formatarData(v.ultimaVenda)}` : " · Sem vendas faturadas no período"}</p></div><div className="flex w-full flex-wrap items-center justify-between gap-4 sm:w-auto"><div className="text-right"><p className="text-xl font-semibold text-jj-yellow">{v.pontos.toLocaleString("pt-BR")} <span className="text-sm">pontos</span></p><p className="mt-1 text-xs text-white/60">{dinheiro(v.liquido)} líquidos</p></div><button type="button" className="btn-ghost" aria-pressed={vendedor === v.id} onClick={() => { setVendedor(v.id); document.getElementById("evolucao-equipe")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Ver evolução</button></div></article>)}</div>
      {!lista.length && <p className="mt-5 text-sm text-white/60">{equipe.length ? "Nenhum vendedor encontrado." : "Cadastre os vendedores para acompanhar seus pontos."}</p>}
    </div>
    <div id="evolucao-equipe" className="scroll-mt-6"><div className="mb-3 max-w-md"><label htmlFor="vendedor-evolucao" className="field-label">Acompanhar evolução</label><select id="vendedor-evolucao" className="input" value={selecionado?.id || ""} onChange={e => setVendedor(e.target.value)}><option value="">Toda a equipe</option>{equipe.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}</select></div><PointsProgress dados={evolucao} titulo={selecionado ? `Evolução de ${selecionado.nome}` : "Evolução da equipe"} /></div>
    <p className="text-xs text-white/60">A classificação e os prêmios abaixo seguem faturamento líquido. Os pontos são acompanhados separadamente.</p>
  </section>;
}
