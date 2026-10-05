"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useStore, uid } from "@/lib/store";
import type { Marca } from "@/lib/types";

const inicial = { nome: "", codigo_externo: "" };

export default function MarcasPage() {
  const { marcas, salvarMarca } = useStore();
  const [form, setForm] = useState(inicial);
  const [editando, setEditando] = useState<Marca | null>(null);
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const lista = marcas.filter((m) => `${m.nome} ${m.codigo_externo || ""}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));

  function limpar() { setForm(inicial); setEditando(null); }
  function editar(m: Marca) {
    setEditando(m); setForm({ nome: m.nome, codigo_externo: m.codigo_externo || "" }); setErro(""); setSucesso("");
    document.getElementById("form-marca")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("nome-marca")?.focus({ preventScroll: true });
  }
  async function salvar(event: FormEvent) {
    event.preventDefault(); setBusy("form"); setErro(""); setSucesso("");
    try {
      await salvarMarca({ id: editando?.id || uid(), nome: form.nome.trim(), codigo_externo: form.codigo_externo.trim(), ativa: editando?.ativa ?? true });
      setSucesso(editando ? "Marca atualizada." : "Marca cadastrada. Agora você pode vincular produtos e campanhas a ela."); limpar();
    } catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível salvar a marca."); }
    finally { setBusy(""); }
  }
  async function alternar(m: Marca) {
    setBusy(m.id); setErro(""); setSucesso("");
    try {
      await salvarMarca({ ...m, ativa: m.ativa === false });
      if (editando?.id === m.id) limpar();
      setSucesso(m.ativa === false ? "Marca ativada." : "Marca desativada.");
    } catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível alterar a marca."); }
    finally { setBusy(""); }
  }

  return <AppShell role="admin" title="Marcas" subtitle="Cadastre as marcas que identificam os produtos e suas campanhas.">
    <section id="form-marca" className="card scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{editando ? "Editar marca" : "Cadastrar marca"}</h2>
      <form onSubmit={salvar} className="mt-5"><fieldset disabled={!!busy} className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="nome-marca" className="field-label">Nome da marca</label><input id="nome-marca" className="input" required maxLength={160} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: WAGO" /></div>
        <div><label htmlFor="codigo-marca" className="field-label">Código da marca</label><input id="codigo-marca" className="input" required value={form.codigo_externo} onChange={(e) => setForm({ ...form, codigo_externo: e.target.value })} placeholder="Código usado no seu sistema" /><p className="mt-2 text-xs text-white/60">Este código identifica a marca na planilha de vendas.</p></div>
        <div className="flex flex-wrap gap-3 sm:col-span-2"><button type="submit" className="btn-primary">{busy === "form" ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar marca"}</button>{editando && <button type="button" className="btn-ghost" onClick={limpar}>Cancelar edição</button>}</div>
      </fieldset></form>
    </section>
    <p className="mt-4 text-sm text-white/65">Para cadastrar produtos e definir o valor de cada ponto, acesse <Link href="/admin/produtos" className="font-medium text-jj-yellow underline underline-offset-4">Produtos</Link>.</p>
    {erro && <p className="error-message mt-4" role="alert">{erro}</p>}{sucesso && <p className="success-message mt-4" role="status">{sucesso}</p>}
    <div className="mb-4 mt-7 flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-semibold">Marcas cadastradas <span className="text-sm font-normal text-white/60">({marcas.length})</span></h2><div className="w-full sm:w-72"><label htmlFor="buscar-marca" className="sr-only">Buscar marca ou código</label><input id="buscar-marca" type="search" className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca ou código" /></div></div>
    {!lista.length ? <p className="empty-state text-sm text-white/65">{marcas.length ? "Nenhuma marca encontrada." : "Cadastre a primeira marca acima."}</p> : <div className="grid gap-3 md:grid-cols-2">{lista.map((m) => <article className="card p-5" key={m.id}>
      <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">{m.nome}</h3><span className={`chip ${m.ativa === false ? "bg-white/5 text-white/60" : "bg-jj-yellow/10 text-jj-yellow"}`}>{m.ativa === false ? "Inativa" : "Ativa"}</span></div>
      <p className="mt-2 break-all text-xs text-white/65">Código: {m.codigo_externo || "Não informado"}</p>
      <div className="mt-4 flex gap-2"><button type="button" className="btn-ghost flex-1" disabled={!!busy} onClick={() => editar(m)}>Editar marca</button><button type="button" className="btn-ghost flex-1" disabled={!!busy} onClick={() => void alternar(m)}>{busy === m.id ? "Salvando…" : m.ativa === false ? "Ativar" : "Desativar"}</button></div>
    </article>)}</div>}
  </AppShell>;
}
