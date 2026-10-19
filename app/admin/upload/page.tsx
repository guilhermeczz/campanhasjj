"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { gerarModelo, lerPlanilha, type LinhaValidada } from "@/lib/excel";
import { useAuth } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ImportHelp from "@/components/ImportHelp";

const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (valor: string) => new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default function UploadPage() {
  const { campanhas, categorias, vendedores, adicionarVendas, loading, error } = useStore();
  const { user } = useAuth();
  const [linhas, setLinhas] = useState<LinhaValidada[]>([]);
  const [arquivo, setArquivo] = useState("");
  const [campanhaId, setCampanhaId] = useState("");
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [modeloBaixado, setModeloBaixado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const leituraAtual = useRef(0);
  const campanha = campanhas.find((c) => c.id === campanhaId);
  const ocupado = lendo || salvando || loading || Boolean(error);
  const comErro = linhas.filter((linha) => linha.erro);
  const cadastros = useMemo(() => ({ vendedores, categorias }), [vendedores, categorias]);
  const linhasValor = linhas.filter((l) => !l.erro);
  const resumo = useMemo(() => {
    const grupos = new Map<string, { linhas: number; valor: number }>();
    for (const linha of linhasValor) {
      const grupo = grupos.get(linha.vendedor_nome || linha.vendedor) || { linhas: 0, valor: 0 };
      grupo.linhas++;
      grupo.valor += linha.valor_vendido;
      grupos.set(linha.vendedor_nome || linha.vendedor, grupo);
    }
    return [...grupos.entries()];
  }, [linhasValor]);

  function baixarModelo() {
    try { gerarModelo(); setModeloBaixado(true); setErro(""); }
    catch { setErro("Não foi possível baixar o modelo. Tente novamente."); }
  }

  const abrirArquivo = useCallback(async (file?: File) => {
    if (!file || salvando || loading || error) return;
    const leitura = ++leituraAtual.current;
    setLinhas([]);
    setArquivo(file.name);
    setErro("");
    setSucesso("");
    setLendo(true);
    try {
      const resultado = await lerPlanilha(file, cadastros);
      if (leitura === leituraAtual.current) setLinhas(resultado);
    } catch (e) {
      if (leitura === leituraAtual.current) setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo. Use um Excel .xlsx válido.");
    } finally {
      if (leitura === leituraAtual.current) setLendo(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salvando, loading, error, vendedores, categorias]);

  async function confirmar() {
    if (ocupado || !linhasValor.length || comErro.length || !campanhaId) return;
    setSalvando(true);
    setErro("");
    try {
      const resultado = await adicionarVendas(linhasValor.map((linha) => ({
        linha_planilha: linha.linha,
        vendedor: linha.vendedor,
        vendedor_nome: linha.vendedor_nome,
        categoria: linha.categoria,
        valor_vendido: linha.valor_vendido,
        campanha_id: campanhaId
      })), campanhaId, arquivo);
      setSucesso(`Importação concluída: ${resultado.inseridas} vendas somando ${moeda(linhasValor.reduce((s, l) => s + l.valor_vendido, 0))} para ${resumo.length} ${resumo.length === 1 ? "vendedor" : "vendedores"}. O ranking já considera os dados enviados.`);
      setLinhas([]);
      setArquivo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Sua revisão foi mantida para tentar novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const passo = linhas.length ? 2 : arquivo || modeloBaixado ? 1 : 0;

  return (
    <AppShell role="admin" title="Importar vendas" subtitle="Escolha a campanha, envie a planilha e revise antes de confirmar. Cada linha é uma venda com vendedor, valor e categoria.">
      <ol aria-label="Etapas da importação" className="mb-6 grid grid-cols-3 gap-2 text-xs sm:gap-4 sm:text-sm">
        {["Baixe e preencha", "Selecione o arquivo", "Revise e confirme"].map((etapa, i) => (
          <li key={etapa} aria-current={i === passo ? "step" : undefined} className={`flex items-center gap-2 rounded-xl border p-3 ${i === passo ? "border-jj-yellow/40 bg-jj-yellow/10 text-jj-yellow" : "border-white/10 text-white/55"}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current font-bold">{i + 1}</span>
            <span>{etapa}</span>
          </li>
        ))}
      </ol>

      {sucesso && <div role="status" className="mb-5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-200"><p>{sucesso}</p><div className="mt-3 flex flex-wrap gap-3"><Link className="btn-primary" href="/admin/auditoria">Ver histórico ou desfazer importação</Link><Link className="btn-ghost" href="/admin">Ver campanhas e rankings</Link></div></div>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">Não foi possível carregar os cadastros: {error}</p>}

      <section className="card mb-4 p-5 sm:p-6" aria-labelledby="campanha-titulo">
        <label htmlFor="campanha-importacao" className="field-label">Campanha desta importação</label>
        <select id="campanha-importacao" className="input max-w-xl" value={campanhaId} disabled={ocupado} onChange={(e) => { setCampanhaId(e.target.value); setSucesso(""); }}>
          <option value="">Selecione a campanha…</option>
          {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}{!c.ativa ? " · Pausada" : ""}</option>)}
        </select>
        <p id="campanha-titulo" className="mt-2 text-xs text-white/60">{campanha ? `Período: ${campanha.data_inicio.split("-").reverse().join("/")} a ${campanha.data_fim.split("-").reverse().join("/")}. Importador: ${user?.nome || ""}.` : "As vendas da planilha entram nesta campanha e só contam no ranking dela."}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="modelo-titulo">
          <p className="section-eyebrow">Passo 1</p>
          <h2 id="modelo-titulo" className="mt-2 text-xl font-semibold">Comece pelo modelo</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">Baixe a planilha com as colunas prontas e preencha uma linha por venda. Uma única aba Vendas, sem exemplos no arquivo.</p>
          <p className="mt-3 rounded-xl bg-white/5 p-3 text-xs leading-5 text-white/65"><strong className="text-white">Modelo com 3 colunas.</strong> Vendedor, Valor Vendido e Categoria, todos pelo nome. Vendedores e categorias precisam estar cadastrados antes da importação.</p>
          <button onClick={baixarModelo} disabled={ocupado} className="btn-primary mt-5 inline-flex items-center gap-2 disabled:opacity-40">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>
            Baixar modelo Excel
          </button>
          <p className="mt-3 text-xs text-white/60">{vendedores.filter((v) => v.ativo && v.role === "vendedor").length} vendedores ativos · {categorias.length} categorias · {campanhas.filter((c) => c.ativa).length} campanhas ativas</p>
          <a href="#ajuda-importacao" className="mt-4 inline-block text-sm font-semibold text-jj-yellow underline underline-offset-4">Preciso de ajuda para preencher</a>
          {!categorias.length && <p className="mt-3 text-sm text-white/65">Antes da primeira importação, <Link href="/admin/categorias" className="text-jj-yellow underline">cadastre as categorias</Link>.</p>}
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="arquivo-titulo">
          <p className="section-eyebrow">Passo 2</p>
          <h2 id="arquivo-titulo" className="mt-2 text-xl font-semibold">Selecione a planilha preenchida</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">Vamos conferir o arquivo primeiro. Nada será salvo até você revisar e confirmar.</p>
          <div
            className={`mt-4 rounded-xl border-2 border-dashed p-5 text-center transition ${arrastando ? "border-jj-yellow bg-jj-yellow/10" : "border-white/20 bg-black/20"}`}
            onDragOver={(e) => { e.preventDefault(); if (!ocupado) setArrastando(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false); }}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); if (!ocupado) { if (e.dataTransfer.files.length !== 1) { setErro("Envie um arquivo de cada vez."); setLinhas([]); } else void abrirArquivo(e.dataTransfer.files[0]); } }}
          >
            <p className="break-all text-sm font-medium">{lendo ? "Lendo e conferindo a planilha…" : arquivo || "Arraste seu arquivo Excel aqui"}</p>
            <p className="mt-2 text-xs text-white/50">.xlsx · até 5 MB · até 5.000 linhas</p>
            <button onClick={() => inputRef.current?.click()} disabled={ocupado} className="btn-ghost mt-4 disabled:opacity-40">{arquivo ? "Trocar arquivo" : "Selecionar arquivo"}</button>
            <input ref={inputRef} aria-label="Planilha de vendas" type="file" accept=".xlsx" className="hidden" disabled={ocupado} onChange={(e) => { void abrirArquivo(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </section>
      </div>

      {erro && <p role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200">{erro}</p>}
      {linhas.length > 0 && <section className="card mt-5 p-5 sm:p-6" aria-labelledby="revisao-titulo">
        <p className="section-eyebrow">Passo 3</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h2 id="revisao-titulo" className="text-xl font-semibold">Confira antes de importar</h2>
          <span className={`chip ${comErro.length ? "bg-red-500/15 text-red-200" : "bg-emerald-500/15 text-emerald-200"}`}>{comErro.length ? `${comErro.length} linhas precisam de correção` : `${linhasValor.length} vendas prontas para importar`}</span>
        </div>
        {comErro.length > 0 && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-4">
          <h3 role="alert" className="font-bold text-red-200">Vamos corrigir {comErro.length} {comErro.length === 1 ? "linha" : "linhas"}</h3>
          <p className="mt-2 text-sm leading-6 text-white/65">Abra o Excel nas linhas abaixo, faça as correções, salve e selecione o arquivo novamente. Nenhuma venda foi salva.</p>
          <ul className="mt-3 space-y-3">{comErro.slice(0, 10).map((linha) => <li key={linha.linha} className="rounded-lg bg-black/20 p-3"><p className="text-sm font-bold">Linha {linha.linha}</p><ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5 text-red-100">{linha.erro!.split(" · ").map((mensagem) => <li key={mensagem}>{mensagem}</li>)}</ul></li>)}</ul>
          {comErro.length > 10 && <p className="mt-3 text-xs text-white/60">As demais linhas com erro estão na tabela abaixo.</p>}
          <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="btn-primary" disabled={ocupado} onClick={() => inputRef.current?.click()}>Selecionar planilha corrigida</button><a href="#ajuda-importacao" className="btn-ghost">Consultar ajuda</a></div>
        </div>}
        {resumo.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{resumo.map(([nome, grupo]) => <div key={nome} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold text-white">{nome}</p>
          <p className="mt-1 text-xs text-white/50">{grupo.linhas} {grupo.linhas === 1 ? "venda" : "vendas"}</p>
          <p className="mt-2 font-semibold text-jj-yellow">{moeda(grupo.valor)}</p>
        </div>)}</div>}

        <div className="mt-5 max-h-[32rem] overflow-auto rounded-xl border border-white/10" tabIndex={0} aria-label="Revisão das linhas da planilha">
          <table className="w-full min-w-[720px] text-left text-xs">
            <caption className="sr-only">Vendas da planilha e erros de validação</caption>
            <thead className="sticky top-0 bg-[#242424] text-white/75"><tr>{["Linha", "Vendedor", "Categoria", "Valor vendido", "Campanha", "Status"].map((titulo) => <th key={titulo} scope="col" className="px-3 py-3 font-medium">{titulo}</th>)}</tr></thead>
            <tbody>{linhas.map((linha) => <tr key={linha.linha} className={`border-t border-white/10 align-top ${linha.erro ? "bg-red-500/5" : "bg-black/10"}`}>
              <td className="px-3 py-3 text-white/70">{linha.linha}</td>
              <td className="px-3 py-3">{linha.vendedor_nome || linha.vendedor}<span className="mt-1 block text-white/55">{linha.vendedor}</span></td>
              <td className="px-3 py-3">{linha.categoria}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold">{linha.erro ? "—" : moeda(linha.valor_vendido)}</td>
              <td className="px-3 py-3">{campanha?.nome || "—"}</td>
              <td className="min-w-40 px-3 py-3"><p className={linha.erro ? "text-red-200" : "text-emerald-300"}>{linha.erro || "Pronto"}</p></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-5 border-t border-white/10 pt-5">
          <button onClick={() => void confirmar()} disabled={ocupado || comErro.length > 0 || !campanhaId} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">{salvando ? "Importando vendas…" : !campanhaId ? "Selecione a campanha para continuar" : comErro.length ? "Corrija os erros para continuar" : `Confirmar importação de ${linhasValor.length} vendas`}</button>
          <p className="mt-3 text-xs leading-5 text-white/60">A confirmação registra todas as vendas deste arquivo na campanha escolhida ({campanha ? `importado por ${user?.nome || ""} em ${dataHora(new Date().toISOString())}` : "sem campanha"}). O ranking por maior valor vendido é recalculado pelo sistema.</p>
        </div>
      </section>}
      <ImportHelp categorias={categorias} vendedores={vendedores} />
    </AppShell>
  );
}
