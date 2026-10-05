import Link from "next/link";
import type { ResultadoVendedorMarca } from "@/lib/copa";
import type { Campanha } from "@/lib/types";

export function dinheiro(valor: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor || 0));
}

function Premio({ linha }: { linha: ResultadoVendedorMarca }) {
  return <span>{linha.status_empate || linha.valor_premio == null ? "A definir" : dinheiro(linha.valor_premio)}</span>;
}

function Detalhes({ linha }: { linha: ResultadoVendedorMarca }) {
  return <details className="mt-4 border-t border-white/10 pt-3">
    <summary className="cursor-pointer text-xs font-medium text-white/55">Ver cálculo e critérios de desempate</summary>
    <dl className="mt-3 grid gap-2 text-xs text-white/60">
      <div className="flex justify-between gap-3"><dt>Pontos dos produtos <span className="block text-white/55">Informativos; não alteram a classificação</span></dt><dd className="font-semibold text-jj-yellow">{(linha.total_pontos || 0).toLocaleString("pt-BR")} pts</dd></div>
      <div className="flex justify-between gap-3"><dt>Faturamento bruto da marca</dt><dd className="whitespace-nowrap text-white">{dinheiro(linha.faturamento_bruto_marca)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Devoluções da marca</dt><dd className="whitespace-nowrap text-white">− {dinheiro(linha.valor_devolucoes_marca)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Cancelamentos da marca</dt><dd className="whitespace-nowrap text-white">− {dinheiro(linha.valor_cancelamentos_marca)}</dd></div>
      <div className="flex justify-between gap-3 border-t border-white/10 pt-2"><dt>Clientes diferentes da marca</dt><dd className="text-white">{linha.quantidade_clientes_distintos}</dd></div>
      <div className="flex justify-between gap-3"><dt>Faturamento do período <span className="block text-white/55">Usado somente no segundo desempate</span></dt><dd className="whitespace-nowrap text-white">{dinheiro(linha.faturamento_geral_periodo)}</dd></div>
    </dl>
  </details>;
}

export default function CopaRanking({ campanha, linhas, apenasVendedor = false }: {
  campanha: Campanha; linhas: ResultadoVendedorMarca[]; apenasVendedor?: boolean;
}) {
  const destaques = linhas.filter((r) => r.posicao <= 3);
  return <div className="space-y-5">
    {linhas.length === 0 ? <div className="empty-state"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-jj-yellow/25 bg-jj-yellow/10 text-jj-yellow"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 20V10m8 10V4m8 16v-7" /></svg></div><h2 className="font-bold">{apenasVendedor ? "Nenhum resultado nesta campanha" : "Esta campanha ainda não tem resultados"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">{apenasVendedor ? "Quando suas vendas faturadas desta marca forem importadas, sua posição e seu faturamento aparecerão aqui." : "Importe as vendas faturadas. Cada produto será direcionado à campanha da sua marca."}</p>{!apenasVendedor && <Link href="/admin/upload" className="btn-primary mt-5">Importar vendas</Link>}</div> : apenasVendedor ? linhas.map((r) => <section key={r.vendedor_id} className="card border-jj-yellow/25 p-5 sm:p-6">
      <p className="section-eyebrow">Seu resultado em {campanha.nome}</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <div><p className="text-xs text-white/50">Faturamento líquido da marca</p><p className="mt-1 text-3xl font-semibold text-jj-yellow">{dinheiro(r.faturamento_liquido_marca)}</p></div>
        <div><p className="text-xs text-white/50">Sua posição</p><p className="mt-1 text-3xl font-semibold">{r.posicao}º <span className="text-sm font-normal text-white/50">{r.status_empate ? "empatado" : "lugar"}</span></p></div>
        <div><p className="text-xs text-white/50">Prêmio previsto</p><p className="mt-1 text-2xl font-bold"><Premio linha={r} /></p></div>
      </div>
      {r.status_empate && <p role="status" className="mt-5 rounded-xl border border-jj-yellow/25 bg-jj-yellow/10 p-3 text-xs font-bold leading-relaxed text-jj-yellow">{r.status_empate}</p>}
      <Detalhes linha={r} />
    </section>) : <>
      {destaques.length > 0 && <section aria-label="Destaques da campanha"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-bold">Melhores resultados</h2><span className="text-xs text-white/55">Classificação atual</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{destaques.map((r) => <div key={r.vendedor_id} className={`card p-5 ${r.posicao === 1 && !r.status_empate ? "border-jj-yellow/40" : ""}`}><div className="flex items-center justify-between gap-3"><span className={`flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-lg font-bold ${r.status_empate ? "bg-white/10 text-white" : "bg-jj-yellow/15 text-jj-yellow"}`}>{r.posicao}º</span><span className="text-xs text-white/60">{r.status_empate ? "Posição empatada" : `${r.quantidade_clientes_distintos} clientes diferentes`}</span></div><h3 className="mt-4 break-words font-bold">{r.vendedor_nome}</h3><p className="mt-1 text-2xl font-semibold text-jj-yellow">{dinheiro(r.faturamento_liquido_marca)}</p><p className="mt-3 text-xs text-white/55">Prêmio previsto <span className="ml-1 font-bold text-white"><Premio linha={r} /></span></p>{r.status_empate && <p className="mt-2 text-xs leading-relaxed text-jj-yellow">Empate: aguardando decisão da diretoria.</p>}</div>)}</div></section>}
      <section aria-label="Classificação da campanha"><h2 className="mb-3 font-bold">Classificação completa <span className="ml-1 text-xs font-normal text-white/60">{linhas.length} vendedores</span></h2><div className="space-y-2">{linhas.map((r) => <article className="card p-4 sm:p-5" key={r.vendedor_id}><div className="flex items-start gap-3 sm:items-center"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-bold text-white/70">{r.posicao}º</span><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{r.vendedor_nome}</h3><p className="mt-1 text-xs text-white/60">{r.quantidade_clientes_distintos} clientes diferentes{r.status_empate ? " · Empate" : ""}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-jj-yellow sm:text-base">{dinheiro(r.faturamento_liquido_marca)}</p><p className="mt-1 text-xs text-white/60">Prêmio: <Premio linha={r} /></p></div></div>{r.status_empate && <p className="mt-3 text-xs font-semibold leading-relaxed text-jj-yellow">{r.status_empate}</p>}<Detalhes linha={r} /></article>)}</div></section>
    </>}
    <details className="card p-4 sm:p-5"><summary className="cursor-pointer text-sm font-semibold">Como funciona esta campanha?</summary><div className="mt-4 space-y-3 text-sm leading-relaxed text-white/60"><p>Somam as vendas desta marca faturadas no período da campanha. Devoluções e cancelamentos são descontados da mesma marca.</p><ol className="list-inside list-decimal space-y-2"><li>Maior faturamento líquido da marca.</li><li>Em caso de empate, maior número de clientes diferentes.</li><li>Persistindo o empate, maior faturamento do vendedor no período.</li></ol><p>Se os três critérios forem iguais, a diretoria decide. O prêmio fica pendente até a decisão.</p><p className="border-t border-white/10 pt-3 text-white/80">1º: {dinheiro(campanha.premio_1 ?? 2000)} · 2º: {dinheiro(campanha.premio_2 ?? 1500)} · 3º: {dinheiro(campanha.premio_3 ?? 500)}</p><p className="text-xs text-white/55">Os valores de prêmio são previstos e acompanham a classificação até o encerramento da campanha.</p></div></details>
  </div>;
}
