"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ConfirmUndoImport from "@/components/ConfirmUndoImport";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { api } from "@/lib/http";
import type { HistoricoImportacoes, ImportacaoAuditada, PreviaImportacao } from "@/lib/auditoria";

const numero = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (valor: string) => new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const tamanho = (bytes: number) => bytes < 1024 ? `${numero(bytes)} B` : bytes < 1048576 ? `${numero(bytes / 1024)} KB` : `${numero(bytes / 1048576)} MB`;
const colunas: [string, string][] = [
  ["linha", "Linha"], ["item_id", "Código do item"], ["vendedor_nome", "Vendedor"], ["vendedor", "Usuário"],
  ["produto", "Produto na planilha"], ["produto_nome", "Produto cadastrado"], ["marca_nome", "Marca"],
  ["campanha", "Campanha"], ["data_faturamento", "Faturamento"], ["quantidade", "Quantidade"],
  ["valor_bruto", "Venda (R$)"], ["valor_devolucao", "Devolução (R$)"], ["valor_cancelamento", "Cancelamento (R$)"],
  ["cliente_id", "Cliente"], ["status", "Situação"], ["pontos_por_real", "Pontos por R$ 1"],
  ["valor_por_ponto", "R$ por ponto (legado)"], ["pontos", "Pontos calculados"],
];
function celula(chave: string, valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (chave === "data_faturamento") return data(String(valor));
  if (typeof valor === "number") return chave.startsWith("valor_") ? moeda(valor) : numero(valor);
  return valor;
}
function Paginacao({ pagina, paginas, onChange, busy, label }: { pagina: number; paginas: number; onChange: (page: number) => void; busy: boolean; label: string }) {
  if (paginas <= 1) return null;
  return <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-white/60">Página {pagina} de {paginas}</p><div className="flex gap-2"><button type="button" className="btn-ghost" disabled={busy || pagina <= 1} onClick={() => onChange(pagina - 1)}>Anterior</button><button type="button" className="btn-ghost" disabled={busy || pagina >= paginas} onClick={() => onChange(pagina + 1)}>Próxima</button></div></nav>;
}

export default function AuditoriaPage() {
  const { user } = useAuth();
  const { recarregar } = useStore();
  const [historico, setHistorico] = useState<HistoricoImportacoes | null>(null);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionada, setSelecionada] = useState("");
  const [paginaPrevia, setPaginaPrevia] = useState(1);
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erroPrevia, setErroPrevia] = useState("");
  const [desfazendo, setDesfazendo] = useState<ImportacaoAuditada | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroDesfazer, setErroDesfazer] = useState("");
  const [sucesso, setSucesso] = useState("");
  const secaoPrevia = useRef<HTMLElement>(null);
  const autorizado = user?.role === "admin";

  useEffect(() => {
    if (!autorizado) { setHistorico(null); return; }
    const controller = new AbortController();
    setCarregando(true); setErro(""); setHistorico(null);
    api<HistoricoImportacoes>(`/api/auditoria?pagina=${pagina}&busca=${encodeURIComponent(filtro)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setHistorico(result); })
      .catch(error => { if (!controller.signal.aborted) setErro(error.message); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [autorizado, pagina, filtro, versao]);

  useEffect(() => {
    setPrevia(null); setErroPrevia("");
    if (!autorizado || !selecionada) { setLendo(false); return; }
    const controller = new AbortController();
    setLendo(true);
    api<PreviaImportacao>(`/api/auditoria?id=${selecionada}&pagina=${paginaPrevia}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setPrevia(result); })
      .catch(error => { if (!controller.signal.aborted) setErroPrevia(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLendo(false); });
    return () => controller.abort();
  }, [autorizado, selecionada, paginaPrevia, versao]);

  useEffect(() => { if (selecionada) secaoPrevia.current?.focus(); }, [selecionada]);

  async function desfazer() {
    if (!desfazendo || ocupado) return;
    setOcupado(true); setErroDesfazer(""); setSucesso("");
    try {
      const resultado = await api<{ removidas: number; restauradas: number }>("/api/auditoria", {
        method: "POST", body: JSON.stringify({ id: desfazendo.id, confirmar: true }),
      });
      setDesfazendo(null);
      setSucesso(`Importação desfeita. ${resultado.removidas} vendas removidas e ${resultado.restauradas} restauradas. O histórico foi preservado.`);
      setVersao(v => v + 1);
      await recarregar();
    } catch (error) { setErroDesfazer(error instanceof Error ? error.message : "Não foi possível desfazer a importação."); }
    finally { setOcupado(false); }
  }
  function pedirConfirmacao(registro: ImportacaoAuditada) { setErroDesfazer(""); setDesfazendo(registro); }

  return <AppShell role="admin" title="Auditoria de importações" subtitle="Consulte as planilhas de vendas importadas, seus responsáveis e os valores registrados em cada envio.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-white/60">Acesso exclusivo do administrador. Horários de Brasília.</p><Link href="/admin/upload" className="btn-primary">Importar vendas</Link></div>
    {sucesso && <p className="success-message mb-5" role="status">{sucesso}</p>}
    <form onSubmit={event => { event.preventDefault(); setPagina(1); setFiltro(busca.trim()); setVersao(v => v + 1); }} className="card mb-5 flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-0 flex-1"><label htmlFor="buscar-importacao" className="field-label">Buscar arquivo ou responsável</label><input id="buscar-importacao" className="input" type="search" maxLength={120} value={busca} onChange={event => setBusca(event.target.value)} placeholder="Nome da planilha ou administrador" /></div>
      <button className="btn-primary" disabled={carregando || ocupado}>Buscar</button><button type="button" className="btn-ghost" disabled={carregando || ocupado} onClick={() => setVersao(v => v + 1)}>Atualizar</button>
    </form>
    {erro && <p className="error-message" role="alert">{erro}</p>}
    {carregando && <p className="card p-6 text-sm text-white/60" role="status">Carregando histórico…</p>}
    {historico && <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-white/60"><p>{numero(historico.total)} importações encontradas</p><p title="Estimativa dos dados das prévias e da reserva de restauração, sem índices e metadados.">Dados armazenados: aproximadamente {tamanho(historico.bytes_previas + historico.bytes_restauracao)}</p></div>
      {historico.registros.length === 0 ? <div className="empty-state"><h2 className="font-semibold">{filtro ? "Nenhuma importação encontrada" : "Ainda não há importações registradas"}</h2><p className="mt-2 text-sm text-white/60">{filtro ? "Tente outro nome de arquivo ou responsável." : "O histórico começa com as importações concluídas após a ativação da auditoria. Arquivos rejeitados na validação não são registrados."}</p></div> : <div className="space-y-3">{historico.registros.map(registro => <article className="card p-5" key={registro.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-all font-semibold">{registro.arquivo}</h2><p className="mt-1 text-xs text-white/60">{data(registro.criado_em)} · {registro.autor_nome} (@{registro.autor_usuario})</p></div><span className={`chip ${registro.desfeita_em ? "bg-red-400/10 text-red-200" : "bg-emerald-400/10 text-emerald-200"}`}>{registro.desfeita_em ? "Desfeita" : "Concluída"}</span></div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70"><p><strong className="text-white">{numero(registro.total)}</strong> linhas</p><p>{numero(registro.inseridas)} novas · {numero(registro.atualizadas)} atualizadas</p><p>{moeda(registro.valor_liquido)} líquidos</p><p><strong className="text-jj-yellow">{numero(registro.total_pontos)}</strong> pontos no envio</p></div>
        {registro.desfeita_em && <p className="mt-3 text-xs text-red-200">Desfeita em {data(registro.desfeita_em)} por {registro.desfeita_por_nome} (@{registro.desfeita_por_usuario}).</p>}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn-ghost" disabled={ocupado} onClick={() => { setSelecionada(registro.id); setPaginaPrevia(1); }}>Ver prévia</button>{registro.pode_desfazer && <button type="button" className="btn-danger-outline" disabled={ocupado} onClick={() => pedirConfirmacao(registro)}>Desfazer importação</button>}</div>
      </article>)}</div>}
      <Paginacao pagina={pagina} paginas={historico.paginas} onChange={setPagina} busy={carregando || ocupado} label="Páginas do histórico" />
      <p className="mt-4 text-xs leading-5 text-white/50">Somente a última importação pode ser desfeita, uma vez. Uma nova importação substitui essa possibilidade. As prévias preservam os valores do envio e podem diferir dos pontos atuais.</p>
    </>}
    {selecionada && <section ref={secaoPrevia} tabIndex={-1} aria-label="Prévia da importação" className="card mt-7 scroll-mt-6 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><h2 className="break-all font-semibold">{previa ? previa.importacao.arquivo : "Prévia da importação"}</h2><p className="mt-1 text-xs leading-5 text-white/60">Dados registrados no envio, incluindo os pontos calculados. O arquivo Excel original não é armazenado.</p></div><button type="button" className="btn-ghost" onClick={() => setSelecionada("")}>Fechar</button></div>
      {lendo && <p role="status" className="py-8 text-sm text-white/60">Carregando prévia…</p>}
      {erroPrevia && <p role="alert" className="error-message mt-4">{erroPrevia}</p>}
      {previa && <>
        {previa.importacao.desfeita_em && <p className="mt-3 text-sm text-red-200">Esta importação foi desfeita. Os dados abaixo permanecem apenas como registro histórico.</p>}
        <div className="mt-4 overflow-x-auto rounded-lg border border-white/10" tabIndex={0} role="region" aria-label="Dados da planilha, role horizontalmente para ver todas as colunas"><table className="w-full text-left text-xs"><caption className="sr-only">Prévia de {previa.importacao.arquivo}, página {paginaPrevia}</caption><thead className="bg-white/5 text-white/70"><tr>{colunas.map(([chave, titulo]) => <th scope="col" key={chave} className="whitespace-nowrap px-4 py-3 font-medium">{titulo}</th>)}</tr></thead><tbody>{previa.linhas.map((linha, index) => <tr key={index} className="border-t border-white/10 hover:bg-white/[.02]">{colunas.map(([chave]) => <td key={chave} className={`max-w-xs px-4 py-3 ${chave === "pontos" ? "font-semibold text-jj-yellow" : "text-white/80"}`}><span className="block min-w-max">{celula(chave, linha[previa.colunas.indexOf(chave)])}</span></td>)}</tr>)}</tbody></table></div>
        <Paginacao pagina={paginaPrevia} paginas={previa.paginas} onChange={setPaginaPrevia} busy={lendo || ocupado} label="Páginas da prévia" />
      </>}
    </section>}
    <ConfirmUndoImport registro={desfazendo} busy={ocupado} error={erroDesfazer} onCancel={() => setDesfazendo(null)} onConfirm={() => void desfazer()} />
  </AppShell>;
}
