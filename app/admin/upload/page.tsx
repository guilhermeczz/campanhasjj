"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { gerarModeloCopa, lerPlanilhaCopa, type LinhaCopaValidada } from "@/lib/excel";
import { descreverRegra } from "@/lib/pontuacao";
import AppShell from "@/components/AppShell";
import ImportHelp from "@/components/ImportHelp";

const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TAMANHO_PAGINA = 50;

export default function UploadPage() {
  const { campanhas, marcas, vendedores, produtos, vendas, adicionarVendas, buscarDatasItens, loading, error } = useStore();
  const [linhas, setLinhas] = useState<LinhaCopaValidada[]>([]);
  const [arquivo, setArquivo] = useState("");
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [somenteErros, setSomenteErros] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [modeloBaixado, setModeloBaixado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const leituraAtual = useRef(0);
  const ocupado = lendo || salvando || loading || Boolean(error);
  const cadastros = { campanhas, marcas, vendedores, produtos, vendas };
  const comErro = linhas.filter((linha) => linha.erro);
  const filtradas = somenteErros ? comErro : linhas;
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANHO_PAGINA));
  const visiveis = filtradas.slice((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA);
  const resumo = useMemo(() => {
    const grupos = new Map<string, { linhas: number; quantidade: number; liquido: number; pontos: number }>();
    for (const linha of linhas.filter((l) => !l.erro)) {
      const grupo = grupos.get(linha.destino) || { linhas: 0, quantidade: 0, liquido: 0, pontos: 0 };
      grupo.linhas++;
      grupo.quantidade += linha.quantidade;
      grupo.liquido += linha.faturamento_liquido;
      grupo.pontos += linha.pontos;
      grupos.set(linha.destino, grupo);
    }
    return [...grupos.entries()];
  }, [linhas]);

  function baixarModelo() {
    try { gerarModeloCopa(cadastros); setModeloBaixado(true); setErro(""); }
    catch { setErro("Não foi possível baixar o modelo. Tente novamente."); }
  }

  async function abrirArquivo(file?: File) {
    if (!file || salvando || loading || error) return;
    const leitura = ++leituraAtual.current;
    setLinhas([]);
    setArquivo(file.name);
    setErro("");
    setSucesso("");
    setPagina(1);
    setSomenteErros(false);
    setLendo(true);
    try {
      const resultado = await lerPlanilhaCopa(file, cadastros, buscarDatasItens);
      if (leitura === leituraAtual.current) { setLinhas(resultado); setSomenteErros(resultado.some((linha) => linha.erro)); }
    } catch (e) {
      if (leitura === leituraAtual.current) setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo. Use um Excel .xlsx válido.");
    } finally {
      if (leitura === leituraAtual.current) setLendo(false);
    }
  }

  async function confirmar() {
    if (ocupado || !linhas.length || comErro.length) return;
    setSalvando(true);
    setErro("");
    try {
      const resultado = await adicionarVendas(linhas.map((linha) => ({
        id: linha.item_id,
        linha_planilha: linha.linha,
        item_id: linha.item_id,
        vendedor: linha.vendedor,
        vendedor_nome: linha.vendedor_nome,
        produto: linha.produto,
        quantidade: linha.quantidade,
        marca_id: linha.marca_id,
        marca_nome: linha.marca_nome,
        marca: linha.marca_nome,
        campanha: linha.campanha,
        pontos: linha.pontos,
        data_faturamento: linha.data_faturamento,
        valor_bruto: linha.valor_bruto,
        valor_devolucao: linha.valor_devolucao,
        valor_cancelamento: linha.valor_cancelamento,
        cliente_id: linha.cliente_id,
        status: linha.status
      })), arquivo);
      setSucesso(`Importação concluída: ${resultado.inseridas} itens novos e ${resultado.atualizadas} atualizados. Os rankings já consideram os dados enviados.`);
      setLinhas([]);
      setArquivo("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Sua revisão foi mantida para tentar novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AppShell role="admin" title="Importar vendas" subtitle="Envie uma planilha. A marca de cada produto define sua campanha automaticamente.">
      <ol aria-label="Etapas da importação" className="mb-6 grid grid-cols-3 gap-2 text-xs sm:gap-4 sm:text-sm">
        {["Baixe e preencha", "Selecione o arquivo", "Revise e confirme"].map((etapa, i) => (
          <li key={etapa} aria-current={i === (linhas.length ? 2 : arquivo || modeloBaixado ? 1 : 0) ? "step" : undefined} className={`flex items-center gap-2 rounded-xl border p-3 ${i === (linhas.length ? 2 : arquivo || modeloBaixado ? 1 : 0) ? "border-jj-yellow/40 bg-jj-yellow/10 text-jj-yellow" : "border-white/10 text-white/55"}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current font-bold">{i + 1}</span>
            <span>{etapa}</span>
          </li>
        ))}
      </ol>

      {sucesso && <div role="status" className="mb-5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-200"><p>{sucesso}</p><div className="mt-3 flex flex-wrap gap-3"><Link className="btn-primary" href="/admin/auditoria">Ver histórico ou desfazer importação</Link><Link className="btn-ghost" href="/admin">Ver campanhas e rankings</Link></div></div>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">Não foi possível carregar os cadastros: {error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="modelo-titulo">
          <p className="section-eyebrow">Passo 1</p>
          <h2 id="modelo-titulo" className="mt-2 text-xl font-semibold">Comece pelo modelo</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">Baixe a planilha com as colunas prontas e preencha uma linha por produto vendido. Uma única aba, sem exemplos ou explicações no arquivo.</p>
          <p className="mt-3 rounded-xl bg-white/5 p-3 text-xs leading-5 text-white/65"><strong className="text-white">Modelo com 7 colunas.</strong> Data em branco usa a data da importação para vendas novas e mantém a anterior nos reenvios. Cliente, devolução, cancelamento e situação são opcionais: em branco valem zero/faturado. Sem a coluna de cliente, o desempate por clientes fica neutro.</p>
          <button onClick={baixarModelo} disabled={ocupado} className="btn-primary mt-5 inline-flex items-center gap-2 disabled:opacity-40">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>
            Baixar modelo Excel
          </button>
          <p className="mt-3 text-xs text-white/60">{vendedores.filter((v) => v.ativo && v.role === "vendedor").length} vendedores disponíveis · {campanhas.filter((c) => c.ativa && c.tipo === "faturamento_marca").length} campanhas ativas</p>
          <a href="#ajuda-importacao" className="mt-4 inline-block text-sm font-semibold text-jj-yellow underline underline-offset-4">Preciso de ajuda para preencher</a>
          {!produtos.some((p) => p.ativo !== false) && <p className="mt-3 text-sm text-white/65">Antes da primeira venda, <Link href="/admin/produtos" className="text-jj-yellow underline">cadastre os produtos e seus pontos</Link>.</p>}
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
          <span className={`chip ${comErro.length ? "bg-red-500/15 text-red-200" : "bg-emerald-500/15 text-emerald-200"}`}>{comErro.length ? `${comErro.length} linhas precisam de correção` : `${linhas.length} itens prontos para importar`}</span>
        </div>
        {comErro.length > 0 && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-4">
          <h3 role="alert" className="font-bold text-red-200">Vamos corrigir {comErro.length} {comErro.length === 1 ? "linha" : "linhas"}</h3>
          <p className="mt-2 text-sm leading-6 text-white/65">Abra o Excel nas linhas abaixo, faça as correções, salve e selecione o arquivo novamente. Nenhuma venda foi salva.</p>
          <ul className="mt-3 space-y-3">{comErro.slice(0, 10).map((linha) => <li key={linha.linha} className="rounded-lg bg-black/20 p-3"><p className="text-sm font-bold">Linha {linha.linha}{linha.produto ? ` · ${linha.produto}` : ""}</p><ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5 text-red-100">{linha.erro!.split(" · ").map((mensagem) => <li key={mensagem}>{mensagem}</li>)}</ul></li>)}</ul>
          {comErro.length > 10 && <p className="mt-3 text-xs text-white/60">As demais linhas com erro estão na tabela abaixo.</p>}
          <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="btn-primary" disabled={ocupado} onClick={() => inputRef.current?.click()}>Selecionar planilha corrigida</button><a href="#ajuda-importacao" className="btn-ghost">Consultar ajuda</a></div>
        </div>}
        <p className="mt-3 text-sm text-white/60">O resumo abaixo mostra este arquivo. Itens com o mesmo Código do item substituem o registro anterior.</p>
        {resumo.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{resumo.map(([destino, grupo]) => <div key={destino} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold text-white">{destino}</p>
          <p className="mt-1 text-xs text-white/50">{grupo.linhas} itens · {grupo.quantidade.toLocaleString("pt-BR")} unidades</p>
          <p className="mt-2 font-semibold text-jj-yellow">{moeda(grupo.liquido)}</p>
          <p className="mt-1 text-sm text-white/75">{grupo.pontos.toLocaleString("pt-BR")} pontos pelos itens do arquivo</p>
          <p className="mt-1 text-xs text-white/55">{destino === "Fora do período" ? "Armazenado; fora do ranking" : destino === "Somente desempate" ? "Usado apenas no desempate" : "Líquido faturado neste arquivo"}</p>
        </div>)}</div>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
          <p>{linhas.filter((l) => l.status === "cancelado").length} cancelados · {linhas.filter((l) => l.status === "pendente").length} pendentes · não somam no ranking</p>
          {comErro.length > 0 && <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={somenteErros} onChange={(e) => { setSomenteErros(e.target.checked); setPagina(1); }} className="accent-yellow-400" />Mostrar só linhas com erro</label>}
        </div>
        <div className="mt-3 max-h-[32rem] overflow-auto rounded-xl border border-white/10" tabIndex={0} aria-label="Revisão das linhas da planilha">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <caption className="sr-only">Itens da planilha, destinos e erros de validação</caption>
            <thead className="sticky top-0 bg-[#242424] text-white/75"><tr>{["Linha / item", "Vendedor", "Produto / marca", "Faturamento", "Destino", "Bruto", "Devolução", "Cancelamento", "Líquido", "Pontos", "Status / validação"].map((titulo) => <th key={titulo} scope="col" className="px-3 py-3 font-medium">{titulo}</th>)}</tr></thead>
            <tbody>{visiveis.map((linha) => <tr key={linha.linha} className={`border-t border-white/10 align-top ${linha.erro ? "bg-red-500/5" : "bg-black/10"}`}>
              <td className="max-w-40 break-words px-3 py-3"><span className="text-white/60">{linha.linha}</span><br />{linha.item_id}</td>
              <td className="px-3 py-3">{linha.vendedor_nome || linha.vendedor}<span className="mt-1 block text-white/55">{linha.vendedor}</span></td>
              <td className="max-w-48 break-words px-3 py-3">{linha.produto}<span className="mt-1 block text-white/55">{linha.marca_nome}</span></td>
              <td className="whitespace-nowrap px-3 py-3">{linha.data_faturamento ? new Date(linha.data_faturamento).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Data inválida"}{linha.origem_data !== "planilha" && <span className="mt-1 block text-xs text-white/55">{linha.origem_data === "cadastro" ? "Data anterior mantida" : "Data da importação"}</span>}</td>
              <td className="px-3 py-3 text-jj-yellow">{linha.erro ? "Corrigir linha" : linha.destino}</td>
              <td className="whitespace-nowrap px-3 py-3">{moeda(linha.valor_bruto)}</td>
              <td className="whitespace-nowrap px-3 py-3">{moeda(linha.valor_devolucao)}</td>
              <td className="whitespace-nowrap px-3 py-3">{moeda(linha.valor_cancelamento)}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold">{linha.erro ? "—" : moeda(linha.faturamento_liquido)}</td>
              <td className="whitespace-nowrap px-3 py-3">{linha.erro ? "—" : linha.pontos.toLocaleString("pt-BR")}<span className="mt-1 block text-white/60">{descreverRegra(linha)}</span></td>
              <td className="min-w-48 px-3 py-3"><span className="capitalize">{linha.status || "Status inválido"}</span><p className={`mt-1 ${linha.erro ? "text-red-200" : "text-emerald-300"}`}>{linha.erro || (linha.status === "faturado" ? "Pronto" : "Pronto · não soma")}</p></td>
            </tr>)}</tbody>
          </table>
        </div>
        {totalPaginas > 1 && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/60"><button className="btn-ghost disabled:opacity-30" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button><span>Página {pagina} de {totalPaginas}</span><button className="btn-ghost disabled:opacity-30" disabled={pagina === totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima</button></div>}
        <div className="mt-5 border-t border-white/10 pt-5">
          <button onClick={() => void confirmar()} disabled={ocupado || comErro.length > 0} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">{salvando ? "Importando vendas…" : comErro.length ? "Corrija os erros para continuar" : `Confirmar importação de ${linhas.length} itens`}</button>
          <p className="mt-3 text-xs leading-5 text-white/60">A confirmação salva todos os itens deste arquivo. A posição e o prêmio são recalculados pelo sistema para cada campanha.</p>
        </div>
      </section>}
      <ImportHelp marcas={marcas} vendedores={vendedores} produtos={produtos} />
    </AppShell>
  );
}
