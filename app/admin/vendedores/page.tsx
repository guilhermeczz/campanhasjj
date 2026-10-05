"use client";

import { useState, type FormEvent } from "react";
import { useStore, uid } from "@/lib/store";
import type { VendedorFull } from "@/lib/types";
import AppShell from "@/components/AppShell";
import ConfirmDelete from "@/components/ConfirmDelete";

export default function VendedoresPage() {
  const { vendedores, salvarVendedor, excluirVendedor } = useStore();
  const [editando, setEditando] = useState<VendedorFull | null>(null);
  const [username, setUsername] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [excluindo, setExcluindo] = useState<VendedorFull | null>(null);
  const [erroExclusao, setErroExclusao] = useState("");
  const lista = vendedores.filter((v) => v.role === "vendedor");
  const filtrados = lista.filter((v) => `${v.nome} ${v.username}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  function limpar() { setEditando(null); setUsername(""); setNome(""); setSenha(""); }
  function editar(v: VendedorFull) { setEditando(v); setUsername(v.username); setNome(v.nome); setSenha(""); setErro(""); setSucesso(""); document.getElementById("form-vendedor")?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("nome-vendedor")?.focus({ preventScroll: true }); }
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro(""); setSucesso("");
    const usuario = username.trim().toLowerCase();
    if (!usuario || !nome.trim()) { setErro("Preencha o nome e o usuário do vendedor."); return; }
    if ((!editando || senha) && !/^\d{6}$/.test(senha)) { setErro("A senha deve ter exatamente 6 dígitos."); return; }
    if (vendedores.some((v) => v.username === usuario && v.id !== editando?.id)) { setErro("Este usuário já está cadastrado. Escolha outro."); return; }
    setBusy("form");
    try { await salvarVendedor({ id: editando?.id || uid(), nome: nome.trim(), username: usuario, role: "vendedor", ativo: editando?.ativo ?? true, ...(senha ? { senha } : {}) }); setSucesso(editando ? "Vendedor atualizado." : "Vendedor cadastrado. Ele já pode entrar com o usuário e a senha definidos."); limpar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar o vendedor."); }
    finally { setBusy(""); }
  }
  async function alternar(v: VendedorFull) {
    setBusy(v.id); setErro(""); setSucesso("");
    try { await salvarVendedor({ ...v, ativo: !v.ativo }); setSucesso(v.ativo ? "Acesso do vendedor desativado. O histórico de vendas foi preservado." : "Acesso do vendedor ativado."); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível alterar o acesso."); }
    finally { setBusy(""); }
  }
  async function confirmarExclusao() {
    if (!excluindo || busy) return;
    setBusy("exclusao"); setErroExclusao(""); setErro(""); setSucesso("");
    try {
      await excluirVendedor(excluindo.id);
      if (editando?.id === excluindo.id) limpar();
      setSucesso(`O acesso de ${excluindo.nome} foi excluído. Os registros de vendas foram preservados.`);
      setExcluindo(null);
    } catch (error) { setErroExclusao(error instanceof Error ? error.message : "Não foi possível excluir. Tente novamente."); }
    finally { setBusy(""); }
  }
  return <AppShell role="admin" title="Vendedores" subtitle="Crie os acessos da equipe. Cada vendedor acompanha somente os próprios resultados e vendas.">
    <section id="form-vendedor" className="card scroll-mt-24 p-5 sm:p-6"><h2 className="font-bold">{editando ? "Editar vendedor" : "Novo vendedor"}</h2><form onSubmit={salvar} className="mt-5"><fieldset disabled={!!busy} className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="nome-vendedor" className="field-label">Nome completo</label><input id="nome-vendedor" className="input" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João Silva" /></div><div><label htmlFor="usuario-vendedor" className="field-label">Usuário de acesso</label><input id="usuario-vendedor" className="input" required disabled={!!editando} autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())} placeholder="Ex.: joao.silva" /><p className="mt-1.5 text-xs text-white/55">Use este mesmo usuário na planilha de vendas.</p></div><div><label htmlFor="senha-vendedor" className="field-label">{editando ? "Nova senha (opcional)" : "Senha de 6 dígitos"}</label><input id="senha-vendedor" className="input tracking-widest" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} pattern="[0-9]{6}" required={!editando} value={senha} onChange={(e) => setSenha(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /><p className="mt-1.5 text-xs text-white/55">{editando ? "Deixe em branco para manter a senha atual." : "O vendedor usará esta senha para entrar."}</p></div><div className="flex flex-wrap items-end gap-2"><button className="btn-primary" type="submit">{busy === "form" ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar vendedor"}</button>{editando && <button type="button" className="btn-ghost" onClick={limpar}>Cancelar</button>}</div></fieldset></form></section>
    {erro && <p className="error-message mt-4" role="alert">{erro}</p>}{sucesso && <p className="success-message mt-4" role="status">{sucesso}</p>}
    <div className="mb-4 mt-7 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Equipe <span className="ml-1 text-sm font-normal text-white/55">{lista.filter((v) => v.ativo).length} ativos</span></h2><div className="w-full sm:w-64"><label htmlFor="busca-vendedor" className="sr-only">Buscar vendedor</label><input id="busca-vendedor" className="input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou usuário" /></div></div>
    {filtrados.length === 0 ? <div className="empty-state"><p className="text-sm text-white/55">{lista.length ? "Nenhum vendedor encontrado." : "Cadastre o primeiro vendedor no formulário acima."}</p></div> : <div className="space-y-3">{filtrados.map((v) => <article className="card p-4 sm:p-5" key={v.id}><div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold">{v.nome}</h3><span className={`chip ${v.ativo ? "bg-emerald-400/10 text-emerald-200" : "bg-white/5 text-white/60"}`}>{v.ativo ? "Ativo" : "Inativo"}</span></div><p className="mt-1 text-xs text-white/60">@{v.username}</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><button disabled={!!busy} onClick={() => editar(v)} className="btn-ghost flex-1">Editar acesso</button><button disabled={!!busy} onClick={() => alternar(v)} className="btn-ghost flex-1">{busy === v.id ? "Salvando…" : v.ativo ? "Desativar" : "Ativar"}</button><button type="button" disabled={!!busy} onClick={() => { setExcluindo(v); setErroExclusao(""); }} className="btn-danger-outline flex-1">Excluir</button></div></div></article>)}</div>}
    <ConfirmDelete nome={excluindo?.nome || null} busy={busy === "exclusao"} error={erroExclusao} onCancel={() => setExcluindo(null)} onConfirm={() => void confirmarExclusao()} />
  </AppShell>;
}
