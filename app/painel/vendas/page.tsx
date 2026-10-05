"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { descreverRegra } from "@/lib/pontuacao";
import AppShell from "@/components/AppShell";
import { formatarData } from "@/components/CampaignPicker";
import { dinheiro } from "@/components/CopaRanking";

export default function MinhasVendas() {
  const { user } = useAuth();
  const { vendas } = useStore();
  const [filtro, setFiltro] = useState("");
  const minhas = vendas.filter((v) => v.vendedor === user?.username);
  const campanhas = Array.from(new Set(minhas.map((v) => v.campanha).filter(Boolean)));
  const filtradas = minhas.filter((v) => !filtro || v.campanha === filtro);
  return <AppShell role="vendedor" title="Minhas vendas" subtitle="Confira os lançamentos importados pela diretoria. Os resultados da campanha consideram somente o faturamento válido no período.">
    <section className="card mb-5 p-4 sm:p-5"><label htmlFor="filtro-vendas" className="field-label">Campanha</label><select id="filtro-vendas" className="input" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos os meus lançamentos</option>{campanhas.map((c) => <option key={c}>{c}</option>)}</select><p className="mt-3 text-xs text-white/60">{filtradas.length} lançamentos encontrados</p></section>
    {filtradas.length === 0 ? <div className="empty-state"><h2 className="font-bold">Nenhuma venda importada ainda</h2><p className="mt-2 text-sm text-white/55">Seus produtos e valores aparecerão aqui após a importação.</p></div> : <div className="space-y-3">{filtradas.map((v) => <article key={v.id} className="card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="section-eyebrow">{v.campanha || "Sem campanha vinculada"}</p><h2 className="mt-2 break-words text-sm font-bold">{v.produto}</h2><p className="mt-1 text-xs text-white/60">{v.quantidade} unidades · Faturamento em {formatarData(v.data_faturamento || "")}</p></div><span className={`chip ${v.status === "cancelado" ? "bg-red-400/10 text-red-200" : "bg-white/5 text-white/60"}`}>{v.status === "cancelado" ? "Cancelado" : v.status === "faturado" ? "Faturado" : v.status || "Pendente"}</span></div><p className="mt-4 text-lg font-semibold text-jj-yellow">{Number(v.pontos || 0).toLocaleString("pt-BR")} pontos <span className="text-xs font-normal text-white/60">{v.status === "faturado" ? `(${descreverRegra(v)})` : "— não soma"}</span></p><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-xs sm:grid-cols-4"><div><dt className="text-white/60">Valor bruto</dt><dd className="mt-1 font-semibold">{dinheiro(v.valor_bruto)}</dd></div><div><dt className="text-white/60">Devoluções</dt><dd className="mt-1 font-semibold">{dinheiro(v.valor_devolucao)}</dd></div><div><dt className="text-white/60">Cancelamentos</dt><dd className="mt-1 font-semibold">{dinheiro(v.valor_cancelamento)}</dd></div><div><dt className="text-white/60">Cliente</dt><dd className="mt-1 break-words font-semibold">{v.cliente_id || "—"}</dd></div></dl></article>)}</div>}
  </AppShell>;
}
