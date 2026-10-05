"use client";

import { useState } from "react";
import Link from "next/link";
import { CAMPOS_PLANILHA, DUVIDAS_IMPORTACAO, normalizarCabecalho } from "@/lib/importacaoGuia";
import type { Marca, Produto, VendedorFull } from "@/lib/types";

export default function ImportHelp({ marcas, vendedores, produtos }: { marcas: Marca[]; vendedores: VendedorFull[]; produtos: Produto[] }) {
  const [busca, setBusca] = useState("");
  const [buscaCodigo, setBuscaCodigo] = useState("");
  const [tipo, setTipo] = useState<"marca" | "vendedor" | "produto">("marca");
  const [aviso, setAviso] = useState("");
  const termo = normalizarCabecalho(busca);
  const termoCodigo = normalizarCabecalho(buscaCodigo);
  const duvidas = DUVIDAS_IMPORTACAO.filter((item) => normalizarCabecalho(`${item.pergunta} ${item.resposta}`).includes(termo));
  const campos = CAMPOS_PLANILHA.filter((item) => normalizarCabecalho(`${item.titulo} ${item.ajuda} ${item.exemplo}`).includes(termo));
  const referencias = (tipo === "marca"
    ? marcas.map((m) => ({ id: m.id, nome: m.nome, codigo: m.codigo_externo || m.id }))
    : tipo === "produto" ? produtos.filter(p => p.ativo !== false).map(p => ({ id: p.id, nome: `${p.nome} · ${marcas.find(m => m.id === p.marca_id)?.nome || p.marca_nome}`, codigo: p.codigo_externo || p.nome }))
    : vendedores.filter((v) => v.ativo && v.role === "vendedor").map((v) => ({ id: v.id, nome: v.nome, codigo: v.username })))
    .filter((item) => normalizarCabecalho(`${item.nome} ${item.codigo}`).includes(termoCodigo));

  async function copiar(codigo: string) {
    try { await navigator.clipboard.writeText(codigo); setAviso(`Copiado: ${codigo}. Cole na coluna ${tipo === "marca" ? "Código da marca" : tipo === "produto" ? "Produto" : "Vendedor"}.`); }
    catch { setAviso(`Selecione e copie o código manualmente: ${codigo}`); }
  }

  return <section id="ajuda-importacao" className="card mt-5 scroll-mt-24 p-5 sm:p-6" aria-labelledby="ajuda-titulo">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="section-eyebrow">Ajuda para preencher</p><h2 id="ajuda-titulo" className="mt-2 text-xl font-bold">Tire sua dúvida aqui</h2><p className="mt-2 text-sm text-white/60">Veja um exemplo, encontre um código ou busque uma dúvida.</p></div>
      <div className="w-full sm:w-72"><label htmlFor="buscar-ajuda" className="field-label">Qual é a sua dúvida?</label><input id="buscar-ajuda" type="search" className="input" placeholder="Ex.: devolução, nota, cliente…" value={busca} onChange={(event) => setBusca(event.target.value)} /></div>
    </div>

    <details className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4" open={busca ? true : undefined}>
      <summary className="cursor-pointer text-sm font-bold">O que preencher em cada coluna? <span className="ml-1 font-normal text-white/60">7 obrigatórias + 4 opcionais</span></summary>
      <p className="mt-3 text-sm leading-6 text-white/60">Uma linha representa um produto da nota. Data do faturamento, devolução, cancelamento e situação são opcionais. Confira abaixo os campos obrigatórios.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{campos.map((campo) => <article key={campo.chave} className="rounded-xl border border-white/10 p-4">
        <h3 className="text-sm font-bold">{campo.titulo} <span className={`ml-1 text-xs font-normal ${campo.opcional ? "text-white/55" : "text-jj-yellow"}`}>{campo.opcional ? "Opcional" : "Obrigatório"}</span></h3>
        <p className="mt-2 text-xs leading-5 text-white/65">{campo.ajuda}</p>
        <p className="mt-3 break-words rounded-lg bg-white/5 px-3 py-2 text-xs"><span className="text-white/60">Exemplo: </span>{campo.exemplo}</p>
      </article>)}</div>
      {!campos.length && <p className="mt-3 text-sm text-white/50">Nenhuma coluna encontrada com esse termo.</p>}
    </details>

    <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <summary className="cursor-pointer text-sm font-bold">Consultar marcas, produtos e vendedores</summary>
      <div className="mt-4 flex flex-wrap gap-2">{([['marca', 'Marcas'], ['produto', 'Produtos'], ['vendedor', 'Vendedores']] as const).map(([valor, titulo]) => <button key={valor} type="button" className={tipo === valor ? "btn-primary" : "btn-ghost"} aria-pressed={tipo === valor} onClick={() => { setTipo(valor); setAviso(""); }}>{titulo}</button>)}</div>
      <label htmlFor="buscar-codigo" className="field-label mt-4">{tipo === "marca" ? "Buscar marca por nome ou código" : tipo === "produto" ? "Buscar produto por nome ou código" : "Buscar vendedor por nome ou login"}</label>
      <input id="buscar-codigo" className="input" type="search" value={buscaCodigo} onChange={(event) => setBuscaCodigo(event.target.value)} placeholder={tipo === "marca" ? "Ex.: Enerbras" : tipo === "produto" ? "Ex.: Adaptador" : "Ex.: João"} />
      <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">{referencias.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.nome}</p><p className="mt-1 select-all break-all font-mono text-xs text-jj-yellow">{item.codigo}</p></div><button type="button" onClick={() => void copiar(item.codigo)} className="btn-ghost shrink-0" aria-label={`Copiar ${tipo === "marca" ? "código" : "login"} de ${item.nome}`}>Copiar</button></li>)}</ul>
      {!referencias.length && <p className="mt-3 text-sm text-white/55">Nenhum resultado. Confira o nome ou faça o cadastro primeiro.</p>}
      {aviso && <p role="status" className="mt-3 break-words text-sm text-jj-yellow">{aviso}</p>}
      <Link href={tipo === "marca" ? "/admin/marcas" : tipo === "produto" ? "/admin/produtos" : "/admin/vendedores"} className="mt-4 inline-block text-sm text-jj-yellow underline underline-offset-4">{tipo === "marca" ? "Cadastrar ou editar marcas" : tipo === "produto" ? "Cadastrar ou editar produtos" : "Cadastrar ou editar vendedores"}</Link>
    </details>

    <h3 className="mb-3 mt-6 text-sm font-bold">Dúvidas frequentes</h3>
    <div className="space-y-2">{duvidas.map((item) => <details key={item.pergunta} className="rounded-xl border border-white/10 p-4" open={busca ? true : undefined}><summary className="cursor-pointer text-sm font-semibold leading-6">{item.pergunta}</summary><p className="mt-3 text-sm leading-6 text-white/65">{item.resposta}</p></details>)}</div>
    {!duvidas.length && <p className="text-sm text-white/50">Nenhuma dúvida encontrada. Tente uma palavra, como “devolução” ou “código”.</p>}
    {busca && <button type="button" className="btn-ghost mt-4" onClick={() => setBusca("")}>Limpar busca</button>}
  </section>;
}
