"use client";

import { useState } from "react";
import Link from "next/link";
import { CAMPOS_PLANILHA, normalizarCabecalho } from "@/lib/importacaoGuia";
import type { Categoria, VendedorFull } from "@/lib/types";

export default function ImportHelp({ categorias, vendedores }: { categorias: Categoria[]; vendedores: VendedorFull[] }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"categoria" | "vendedor">("categoria");
  const [aviso, setAviso] = useState("");
  const termo = normalizarCabecalho(busca);
  const referencias = (tipo === "categoria"
    ? categorias.map((c) => ({ id: c.id, nome: c.nome, codigo: c.nome }))
    : vendedores.filter((v) => v.ativo && v.role === "vendedor").map((v) => ({ id: v.id, nome: v.nome, codigo: v.username })))
    .filter((item) => normalizarCabecalho(`${item.nome} ${item.codigo}`).includes(termo));

  async function copiar(codigo: string) {
    try { await navigator.clipboard.writeText(codigo); setAviso(`Copiado: ${codigo}. Cole na coluna ${tipo === "categoria" ? "Categoria" : "Vendedor"}.`); }
    catch { setAviso(`Selecione e copie manualmente: ${codigo}`); }
  }

  return <section id="ajuda-importacao" className="card mt-5 scroll-mt-24 p-5 sm:p-6" aria-labelledby="ajuda-titulo">
    <div><p className="section-eyebrow">Referência de preenchimento</p><h2 id="ajuda-titulo" className="mt-2 text-xl font-bold">Colunas e nomes</h2><p className="mt-2 text-sm text-white/60">O essencial para montar a planilha e encontrar os nomes corretos.</p></div>

    <details className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
      <summary className="cursor-pointer text-sm font-bold">O que preencher em cada coluna? <span className="ml-1 font-normal text-white/60">3 colunas obrigatórias</span></summary>
      <p className="mt-3 text-sm leading-6 text-white/60">Cada linha representa uma venda. Nome do vendedor, valor vendido e categoria — tudo pelo nome.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{CAMPOS_PLANILHA.map((campo) => <article key={campo.chave} className="rounded-xl border border-white/10 p-4">
        <h3 className="text-sm font-bold">{campo.titulo} <span className={`ml-1 text-xs font-normal ${campo.opcional ? "text-white/55" : "text-jj-yellow"}`}>{campo.opcional ? "Opcional" : "Obrigatório"}</span></h3>
        <p className="mt-2 text-xs leading-5 text-white/65">{campo.ajuda}</p>
        <p className="mt-3 break-words rounded-lg bg-white/5 px-3 py-2 text-xs"><span className="text-white/60">Exemplo: </span>{campo.exemplo}</p>
      </article>)}</div>
    </details>

    <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <summary className="cursor-pointer text-sm font-bold">Consultar categorias e vendedores</summary>
      <div className="mt-4 flex flex-wrap gap-2">{([['categoria', 'Categorias'], ['vendedor', 'Vendedores']] as const).map(([valor, titulo]) => <button key={valor} type="button" className={tipo === valor ? "btn-primary" : "btn-ghost"} aria-pressed={tipo === valor} onClick={() => { setTipo(valor); setAviso(""); }}>{titulo}</button>)}</div>
      <label htmlFor="buscar-nome" className="field-label mt-4">{tipo === "categoria" ? "Buscar categoria por nome" : "Buscar vendedor por nome ou login"}</label>
      <input id="buscar-nome" className="input" type="search" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder={tipo === "categoria" ? "Ex.: Tubos" : "Ex.: João"} />
      <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">{referencias.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.nome}</p><p className="mt-1 select-all break-all font-mono text-xs text-jj-yellow">{item.codigo}</p></div><button type="button" onClick={() => void copiar(item.codigo)} className="btn-ghost shrink-0" aria-label={`Copiar ${tipo === "categoria" ? "nome da categoria" : "login"} de ${item.nome}`}>Copiar</button></li>)}</ul>
      {!referencias.length && <p className="mt-3 text-sm text-white/55">Nenhum resultado. Confira o nome ou faça o cadastro primeiro.</p>}
      {aviso && <p role="status" className="mt-3 break-words text-sm text-jj-yellow">{aviso}</p>}
      <Link href={tipo === "categoria" ? "/admin/categorias" : "/admin/vendedores"} className="mt-4 inline-block text-sm text-jj-yellow underline underline-offset-4">{tipo === "categoria" ? "Cadastrar ou editar categorias" : "Cadastrar ou editar vendedores"}</Link>
    </details>
  </section>;
}
