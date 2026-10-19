"use client";

import Link from "next/link";
import type { RankingValor, Campanha } from "@/lib/types";

export function dinheiro(valor: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor || 0));
}

function Premio({ linha }: { linha: RankingValor }) {
  return <span>{linha.status_empate || linha.valor_premio == null ? "A definir" : dinheiro(linha.valor_premio)}</span>;
}

export default function CopaRanking({ campanha, linhas }: { campanha: Campanha; linhas: RankingValor[] }) {
  if (!linhas.length) {
    return <div className="empty-state">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-jj-yellow/25 bg-jj-yellow/10 text-jj-yellow"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 20V10m8 10V4m8 16v-7" /></svg></div>
      <h2 className="font-bold">Nenhuma categoria com vendas ainda</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">Importe a planilha de vendas para acompanhar o ranking de cada categoria.</p>
      <Link href="/admin/upload" className="btn-primary mt-5">Importar vendas</Link>
    </div>;
  }

  const grupos = new Map<string, RankingValor[]>();
  for (const linha of linhas) {
    const atual = grupos.get(linha.categoria_nome) ?? [];
    atual.push(linha);
    grupos.set(linha.categoria_nome, atual);
  }
  const categorias = [...grupos.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return <div className="space-y-7">
    {categorias.map((categoria) => {
      const rows = (grupos.get(categoria) ?? []).slice().sort((a, b) => a.posicao - b.posicao);
      const destaques = rows.filter((r) => r.posicao <= 3);
      return <section key={categoria} aria-label={`Ranking da categoria ${categoria}`} className="space-y-3">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
          <h2 className="text-lg font-bold">{categoria}</h2>
          <span className="text-xs text-white/55">{rows.length} {rows.length === 1 ? "vendedor" : "vendedores"}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{destaques.map((r) => <div key={r.vendedor_id} className={`card p-5 ${r.posicao === 1 && !r.status_empate ? "border-jj-yellow/40" : ""}`}><div className="flex items-center justify-between gap-3"><span className={`flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-lg font-bold ${r.status_empate ? "bg-white/10 text-white" : "bg-jj-yellow/15 text-jj-yellow"}`}>{r.posicao}º</span><span className="text-xs text-white/60">{r.status_empate ? "Posição empatada" : `${r.itens} ${r.itens === 1 ? "venda" : "vendas"}`}</span></div><h3 className="mt-4 break-words font-bold">{r.vendedor_nome}</h3><p className="mt-1 text-2xl font-semibold text-jj-yellow">{dinheiro(r.total_vendido)}</p><p className="mt-3 text-xs text-white/55">Prêmio previsto <span className="ml-1 font-bold text-white"><Premio linha={r} /></span></p>{r.status_empate && <p className="mt-2 text-xs leading-relaxed text-jj-yellow">Empate: aguardando decisão da diretoria.</p>}</div>)}</div>
        <div className="space-y-2">{rows.map((r) => <article className="card p-4 sm:p-5" key={r.vendedor_id}><div className="flex items-start gap-3 sm:items-center"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-bold text-white/70">{r.posicao}º</span><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{r.vendedor_nome}</h3><p className="mt-1 text-xs text-white/60">{r.itens} {r.itens === 1 ? "venda" : "vendas"}{r.status_empate ? " · Empate" : ""}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-jj-yellow sm:text-base">{dinheiro(r.total_vendido)}</p><p className="mt-1 text-xs text-white/60">Prêmio: <Premio linha={r} /></p></div></div>{r.status_empate && <p className="mt-3 text-xs font-semibold leading-relaxed text-jj-yellow">{r.status_empate}</p>}</article>)}</div>
      </section>;
    })}
    <details className="card p-4 sm:p-5"><summary className="cursor-pointer text-sm font-semibold">Como funciona?</summary><div className="mt-4 space-y-3 text-sm leading-relaxed text-white/60"><p>Cada venda entra na sua categoria e soma o valor vendido do vendedor no ranking daquela categoria, separadamente. Não existe ranking geral, nem por vendedor nem para a diretoria.</p><ol className="list-inside list-decimal space-y-2"><li>Maior valor vendido na categoria, dentro do período.</li><li>Em caso de empate, o prêmio fica pendente até a decisão da diretoria.</li></ol><p className="border-t border-white/10 pt-3 text-white/80">1º: {dinheiro(campanha.premio_1 ?? 2000)} · 2º: {dinheiro(campanha.premio_2 ?? 1500)} · 3º: {dinheiro(campanha.premio_3 ?? 500)} <span className="text-white/55">(por categoria)</span></p></div></details>
  </div>;
}
