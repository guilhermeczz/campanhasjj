"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useStore, uid } from "@/lib/store";
import type { Campanha } from "@/lib/types";
import AppShell from "@/components/AppShell";
import { formatarData } from "@/components/CampaignPicker";
import { dinheiro } from "@/components/CopaRanking";
import ConfirmDelete from "@/components/ConfirmDelete";

const inicial = { nome: "", descricao: "", marca_id: "", data_inicio: "2026-10-01", data_fim: "2026-12-31", premio_1: "2000", premio_2: "1500", premio_3: "500" };

export default function CampanhasPage() {
  const { campanhas, marcas, salvarCampanha, excluirCampanha } = useStore();
  const [form, setForm] = useState(inicial);
  const [editando, setEditando] = useState<Campanha | null>(null);
  const [excluindo, setExcluindo] = useState<Campanha | null>(null);
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");
  const lista = campanhas.filter((c) => c.tipo === "faturamento_marca" && c.marca_id);
  const visiveis = lista.filter((c) => c.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  function alterar(campo: keyof typeof inicial, valor: string) { setForm((f) => ({ ...f, [campo]: valor })); }
  function limpar() { setEditando(null); setForm(inicial); }
  function editar(c: Campanha) {
    setEditando(c);
    setForm({ nome: c.nome, descricao: c.descricao || "", marca_id: c.marca_id || "", data_inicio: c.data_inicio, data_fim: c.data_fim, premio_1: String(c.premio_1 ?? 2000), premio_2: String(c.premio_2 ?? 1500), premio_3: String(c.premio_3 ?? 500) });
    setErro(""); setSucesso("");
    document.getElementById("form-campanha")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("nome-campanha")?.focus({ preventScroll: true });
  }
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro(""); setSucesso("");
    if (!form.nome.trim() || !form.marca_id || !form.data_inicio || !form.data_fim) { setErro("Preencha o nome, a marca e as duas datas."); return; }
    if (form.data_fim < form.data_inicio) { setErro("A data final deve ser igual ou posterior à data inicial."); return; }
    if ([form.premio_1, form.premio_2, form.premio_3].some((p) => !p.trim() || !Number.isFinite(Number(p)) || Number(p) < 0)) { setErro("Informe valores de prêmio válidos, iguais ou maiores que zero."); return; }
    if (lista.some((c) => c.id !== editando?.id && c.marca_id === form.marca_id && c.ativa && c.data_inicio <= form.data_fim && c.data_fim >= form.data_inicio)) { setErro("Esta marca já tem uma campanha ativa neste período. Edite a campanha existente."); return; }
    setBusy("form");
    try {
      await salvarCampanha({ id: editando?.id || uid(), nome: form.nome.trim(), descricao: form.descricao.trim(), marca_id: form.marca_id, marca_nome: marcas.find((m) => m.id === form.marca_id)?.nome, data_inicio: form.data_inicio, data_fim: form.data_fim, tipo: "faturamento_marca", ativa: editando?.ativa ?? true, premio_1: Number(form.premio_1), premio_2: Number(form.premio_2), premio_3: Number(form.premio_3) });
      setSucesso(editando ? "Campanha atualizada." : "Campanha criada. As vendas desta marca serão direcionadas automaticamente para ela."); limpar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar a campanha."); }
    finally { setBusy(""); }
  }
  async function alternar(c: Campanha) {
    setBusy(c.id); setErro(""); setSucesso("");
    try { await salvarCampanha({ ...c, ativa: !c.ativa }); setSucesso(c.ativa ? "Campanha pausada." : "Campanha ativada."); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível alterar a campanha."); }
    finally { setBusy(""); }
  }
  async function confirmarExcluir() {
    if (!excluindo) return;
    setBusy("excluir"); setErro("");
    try {
      await excluirCampanha(excluindo.id);
      setSucesso(`Campanha "${excluindo.nome}" excluída.`);
      setExcluindo(null);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível excluir a campanha."); }
    finally { setBusy(""); }
  }
  return <AppShell role="admin" title="Campanhas" subtitle="Uma marca por campanha. O código da marca direciona as vendas para a classificação certa.">
    <ConfirmDelete tipo="campanha" nome={excluindo?.nome || null} busy={busy === "excluir"} error={erro} onCancel={() => setExcluindo(null)} onConfirm={confirmarExcluir} />
    <section id="form-campanha" className="card scroll-mt-24 p-5 sm:p-6"><h2 className="font-bold">{editando ? `Editar ${editando.nome}` : "Nova campanha"}</h2><p className="mt-1 text-xs text-white/60">Copa dos Campeões · Faturamento líquido por marca</p>
      {marcas.length === 0 ? <p className="mt-4 text-sm text-white/60">Cadastre primeiro uma marca em <Link href="/admin/marcas" className="font-bold text-jj-yellow underline">Marcas</Link>.</p> : <form onSubmit={salvar} className="mt-5"><fieldset disabled={!!busy} className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="marca-campanha" className="field-label">Marca participante</label><select id="marca-campanha" className="input" required value={form.marca_id} onChange={(e) => { const marca = marcas.find((m) => m.id === e.target.value); setForm((f) => ({ ...f, marca_id: e.target.value, nome: !editando && (!f.nome || f.nome === marcas.find((m) => m.id === f.marca_id)?.nome) ? marca?.nome || "" : f.nome })); }}><option value="">Selecione a marca</option>{marcas.filter((m) => m.ativa !== false || m.id === form.marca_id).map((m) => <option key={m.id} value={m.id}>{m.nome} · {m.codigo_externo || "sem código"}</option>)}</select></div>
        <div><label htmlFor="nome-campanha" className="field-label">Nome da campanha</label><input id="nome-campanha" className="input" required placeholder="Ex.: Enerbras" value={form.nome} onChange={(e) => alterar("nome", e.target.value)} /></div>
        <div><label htmlFor="inicio-campanha" className="field-label">Início do faturamento</label><input id="inicio-campanha" className="input" type="date" required value={form.data_inicio} onChange={(e) => alterar("data_inicio", e.target.value)} /></div>
        <div><label htmlFor="fim-campanha" className="field-label">Fim do faturamento</label><input id="fim-campanha" className="input" type="date" required min={form.data_inicio} value={form.data_fim} onChange={(e) => alterar("data_fim", e.target.value)} /></div>
        <div className="sm:col-span-2"><label htmlFor="descricao-campanha" className="field-label">Descrição <span className="font-normal text-white/55">(opcional)</span></label><input id="descricao-campanha" className="input" placeholder="Uma mensagem sobre a campanha" value={form.descricao} onChange={(e) => alterar("descricao", e.target.value)} /></div>
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">{(["premio_1", "premio_2", "premio_3"] as const).map((campo, i) => <div key={campo}><label htmlFor={campo} className="field-label">Prêmio do {i + 1}º lugar (R$)</label><input id={campo} className="input" type="number" inputMode="decimal" min="0" step="0.01" required value={form[campo]} onChange={(e) => alterar(campo, e.target.value)} /></div>)}</div>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" className="btn-primary">{busy === "form" ? "Salvando…" : editando ? "Salvar alterações" : "Criar campanha"}</button>{editando && <button type="button" onClick={limpar} className="btn-ghost">Cancelar edição</button>}</div>
      </fieldset></form>}
    </section>
    {erro && busy !== "excluir" && <p className="error-message mt-4" role="alert">{erro}</p>}{sucesso && <p className="success-message mt-4" role="status">{sucesso}</p>}
    <div className="mb-4 mt-7 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Campanhas cadastradas <span className="ml-1 text-sm font-normal text-white/55">{lista.length}</span></h2><div className="w-full sm:w-64"><label htmlFor="buscar-campanha" className="sr-only">Buscar campanha</label><input id="buscar-campanha" className="input" type="search" placeholder="Buscar campanha" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
    {visiveis.length === 0 ? <div className="empty-state"><p className="text-sm text-white/55">{lista.length ? "Nenhuma campanha encontrada." : "Crie sua primeira campanha no formulário acima."}</p></div> : <div className="grid gap-3 md:grid-cols-2">{visiveis.map((c) => <article key={c.id} className="card p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-bold">{c.nome}</h3><p className="mt-1 text-xs text-white/60">Marca: {marcas.find((m) => m.id === c.marca_id)?.nome || c.marca_nome}</p></div><div className="flex shrink-0 items-center gap-2"><span className={`chip ${c.ativa ? "bg-jj-yellow/10 text-jj-yellow" : "bg-white/5 text-white/55"}`}>{c.ativa ? "Ativa" : "Pausada"}</span><button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-500" title="Excluir campanha" onClick={() => { setErro(""); setSucesso(""); setExcluindo(c); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg></button></div></div><p className="mt-4 text-xs text-white/65">{formatarData(c.data_inicio)} a {formatarData(c.data_fim)}</p>{c.descricao && <p className="mt-2 text-sm leading-relaxed text-white/50">{c.descricao}</p>}<p className="mt-3 text-xs leading-relaxed text-white/50">Prêmios: {dinheiro(c.premio_1)} / {dinheiro(c.premio_2)} / {dinheiro(c.premio_3)}</p><div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" disabled={!!busy} onClick={() => editar(c)}>Editar</button><button className="btn-ghost flex-1" disabled={!!busy} onClick={() => alternar(c)}>{busy === c.id ? "Salvando…" : c.ativa ? "Pausar" : "Ativar"}</button></div></article>)}</div>}
  </AppShell>;
}
