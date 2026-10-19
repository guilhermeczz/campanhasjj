"use client";

import { useState, type FormEvent } from "react";
import { useStore, uid } from "@/lib/store";
import type { Categoria } from "@/lib/types";
import AppShell from "@/components/AppShell";
import ConfirmDelete from "@/components/ConfirmDelete";

export default function CategoriasPage() {
  const { categorias, salvarCategoria, excluirCategoria } = useStore();
  const [nome, setNome] = useState("");
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [excluindo, setExcluindo] = useState<Categoria | null>(null);
  const [erroExclusao, setErroExclusao] = useState("");
  const filtradas = categorias.filter((c) => c.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  function limpar() { setEditando(null); setNome(""); }
  function editar(c: Categoria) { setEditando(c); setNome(c.nome); setErro(""); setSucesso(""); document.getElementById("form-categoria")?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("nome-categoria")?.focus({ preventScroll: true }); }
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro(""); setSucesso("");
    const valor = nome.trim();
    if (!valor) { setErro("Informe o nome da categoria."); return; }
    if (categorias.some((c) => c.id !== editando?.id && c.nome.toLowerCase() === valor.toLowerCase())) { setErro("Já existe uma categoria com este nome."); return; }
    setBusy("form");
    try { await salvarCategoria({ id: editando?.id || uid(), nome: valor }); setSucesso(editando ? "Categoria atualizada." : "Categoria cadastrada. A planilha de vendas já pode usá-la."); limpar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar a categoria."); }
    finally { setBusy(""); }
  }
  async function confirmarExclusao() {
    if (!excluindo || busy) return;
    setBusy("exclusao"); setErroExclusao(""); setErro(""); setSucesso("");
    try {
      await excluirCategoria(excluindo.id);
      if (editando?.id === excluindo.id) limpar();
      setSucesso(`A categoria "${excluindo.nome}" foi excluída.`);
      setExcluindo(null);
    } catch (error) { setErroExclusao(error instanceof Error ? error.message : "Não foi possível excluir. Tente novamente."); }
    finally { setBusy(""); }
  }
  return <AppShell role="admin" title="Categorias" subtitle="As categorias organizam as vendas. A planilha deve usar exatamente estes nomes; categorias desconhecidas bloqueiam a importação.">
    <section id="form-categoria" className="card scroll-mt-24 p-5 sm:p-6"><h2 className="font-bold">{editando ? "Editar categoria" : "Nova categoria"}</h2><form onSubmit={salvar} className="mt-5"><fieldset disabled={!!busy} className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><label htmlFor="nome-categoria" className="field-label">Nome da categoria</label><input id="nome-categoria" className="input" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Tubos" /><p className="mt-1.5 text-xs text-white/55">Use este nome exato na coluna Categoria da planilha de vendas.</p></div><div className="flex flex-wrap items-end gap-2"><button className="btn-primary" type="submit">{busy === "form" ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar categoria"}</button>{editando && <button type="button" className="btn-ghost" onClick={limpar}>Cancelar</button>}</div></fieldset></form></section>
    {erro && <p className="error-message mt-4" role="alert">{erro}</p>}{sucesso && <p className="success-message mt-4" role="status">{sucesso}</p>}
    <div className="mb-4 mt-7 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Categorias cadastradas <span className="ml-1 text-sm font-normal text-white/55">{categorias.length}</span></h2><div className="w-full sm:w-64"><label htmlFor="busca-categoria" className="sr-only">Buscar categoria</label><input id="busca-categoria" className="input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome" /></div></div>
    {filtradas.length === 0 ? <div className="empty-state"><p className="text-sm text-white/55">{categorias.length ? "Nenhuma categoria encontrada." : "Cadastre a primeira categoria no formulário acima."}</p></div> : <div className="grid gap-3 md:grid-cols-2">{filtradas.map((c) => <article className="card flex items-center justify-between gap-4 p-4 sm:p-5" key={c.id}><div className="min-w-0"><h3 className="break-words font-bold">{c.nome}</h3>{c.ativa === false && <p className="mt-1 text-xs text-white/55">Desativada · não aceita novas importações</p>}</div><div className="flex shrink-0 gap-2"><button disabled={!!busy} onClick={() => editar(c)} className="btn-ghost">Editar</button><button type="button" disabled={!!busy} onClick={() => { setExcluindo(c); setErroExclusao(""); }} className="btn-danger-outline">Excluir</button></div></article>)}</div>}
    <ConfirmDelete tipo="categoria" nome={excluindo?.nome || null} busy={busy === "exclusao"} error={erroExclusao} onCancel={() => setExcluindo(null)} onConfirm={() => void confirmarExclusao()} />
  </AppShell>;
}
