"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ConfirmDelete from "@/components/ConfirmDelete";
import { useStore, uid } from "@/lib/store";
import type { Produto } from "@/lib/types";
import { baixarModeloProdutos, lerProdutos, type ProdutoImportado } from "@/lib/produtosExcel";
import { descreverRegra } from "@/lib/pontuacao";
import { parseNumeroBR } from "@/lib/importacao";

const inicial = { nome: "", marca_id: "", valor: "", pontos: "", codigo_externo: "" };


export default function ProdutosPage() {
  const { marcas, produtos, salvarProduto, importarProdutos, excluirProduto } = useStore();
  const [form, setForm] = useState(inicial);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [excluindo, setExcluindo] = useState<Produto | null>(null);
  const [erroExclusao, setErroExclusao] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [marcaImportacao, setMarcaImportacao] = useState("");
  const fileRef = useRef<File | null>(null);
  const [linhas, setLinhas] = useState<ProdutoImportado[]>([]);
  const [pagina, setPagina] = useState(1);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const lista = produtos.filter((p) => `${p.nome} ${p.codigo_externo || ""} ${marcas.find((m) => m.id === p.marca_id)?.nome || ""}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  const erros = linhas.filter((linha) => linha.erro);
  const revisao = erros.length ? erros : linhas;
  const paginas = Math.max(1, Math.ceil(revisao.length / 30));

  function limpar() { setEditando(null); setForm(inicial); }
  function editar(p: Produto) {
    const regra = { preco: p.preco_venda, pontos: p.pontos_por_real };
    setEditando(p); setForm({ nome: p.nome, marca_id: p.marca_id, valor: regra.preco ? String(regra.preco).replace(".", ",") : "", pontos: regra.preco ? String(regra.pontos ?? "").replace(".", ",") : "", codigo_externo: p.codigo_externo || "" });
    setErro(""); setSucesso("");
    document.getElementById("form-produto")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("produto-pontos")?.focus({ preventScroll: true });
  }
  async function salvar(event: FormEvent) {
    event.preventDefault();
    setErro(""); setSucesso("");
    const preco = parseNumeroBR(form.valor);
    const pontos = parseNumeroBR(form.pontos);
    if (!form.nome.trim() || !form.marca_id || preco === null || preco <= 0 || preco >= 10000000000 || Math.abs(preco * 100 - Math.round(preco * 100)) > 0.00001 || pontos === null || pontos <= 0 || pontos >= 10000000000 || Math.abs(pontos * 100 - Math.round(pontos * 100)) > 0.00001) {
      setErro("Preencha nome, marca, preço de venda e pontos por real. Use um valor maior que zero, com até duas casas decimais."); return;
    }
    setBusy("form");
    try {
      await salvarProduto({ id: editando?.id || uid(), nome: form.nome.trim(), marca_id: form.marca_id, marca_nome: marcas.find((m) => m.id === form.marca_id)?.nome || "", valor_por_ponto: null, preco_venda: preco, pontos_por_real: pontos, codigo_externo: form.codigo_externo.trim(), ativo: editando?.ativo ?? true });
      setSucesso(editando ? "Produto atualizado. Os pontos das vendas vinculadas foram recalculados." : "Produto cadastrado e disponível para importar vendas.");
      limpar();
    } catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível salvar o produto."); }
    finally { setBusy(""); }
  }
  async function alternar(p: Produto) {
    setBusy(p.id); setErro(""); setSucesso("");
    try { await salvarProduto({ ...p, ativo: p.ativo === false }); if (editando?.id === p.id) limpar(); setSucesso(p.ativo === false ? "Produto ativado." : "Produto desativado para novas importações."); }
    catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível alterar o produto."); }
    finally { setBusy(""); }
  }
  async function confirmarExclusao() {
    if (!excluindo || busy) return;
    setBusy("exclusao"); setErroExclusao(""); setErro(""); setSucesso("");
    try {
      await excluirProduto(excluindo.id);
      if (editando?.id === excluindo.id) limpar();
      setLinhas([]); setArquivo(""); fileRef.current = null;
      setSucesso(`Produto ${excluindo.nome} excluído. As vendas e os pontos já registrados foram preservados.`);
      setExcluindo(null);
    } catch (error) { setErroExclusao(error instanceof Error ? error.message : "Não foi possível excluir o produto."); }
    finally { setBusy(""); }
  }
  async function abrir(file?: File, marca = marcaImportacao) {
    if (!file || busy) return;
    fileRef.current = file;
    setBusy("leitura"); setErro(""); setSucesso(""); setLinhas([]); setArquivo(file.name); setPagina(1);
    try { setLinhas(await lerProdutos(file, marcas, produtos, marca)); }
    catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível abrir o arquivo."); }
    finally { setBusy(""); }
  }
  async function importar() {
    if (busy || !linhas.length || erros.length) return;
    setBusy("importacao"); setErro(""); setSucesso("");
    try {
      const result = await importarProdutos(linhas.map((linha) => ({ nome: linha.nome, marca_id: linha.marca_id, codigo_externo: linha.codigo_externo, valor_por_ponto: linha.valor_por_ponto, preco_venda: linha.preco_venda, pontos_por_real: linha.pontos_por_real })));
      setSucesso(`${result.inseridas} produtos cadastrados e ${result.atualizadas} atualizados. A pontuação está pronta para uso.`);
      setLinhas([]); setArquivo(""); fileRef.current = null;
    } catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível importar. Sua revisão foi mantida."); }
    finally { setBusy(""); }
  }
  function modelo() {
    try { baixarModeloProdutos(marcas); }
    catch { setErro("Não foi possível baixar o modelo. Tente novamente."); }
  }

  return <AppShell role="admin" title="Produtos" subtitle="Defina o preço de venda e os pontos por real de cada produto. A marca vincula as vendas à campanha.">
    <div className="mb-5 rounded-xl border border-jj-yellow/20 bg-jj-yellow/5 p-4 text-sm leading-6 text-white/75"><strong className="text-jj-yellow">Valor líquido da venda × pontos por real = pontos do vendedor.</strong><p className="mt-1">Exemplo: R$ 100 vendidos com fator 1 somam 100 pontos. Com fator 1,5, somam 150 pontos. A classificação e os prêmios continuam pelo faturamento líquido.</p></div>
    <section id="form-produto" className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby="produto-titulo">
      <h2 id="produto-titulo" className="text-lg font-semibold">{editando ? "Editar produto e pontuação" : "Cadastrar produto"}</h2>
      {!marcas.length ? <p className="mt-4 text-sm text-white/65">Antes de cadastrar produtos, <Link href="/admin/marcas" className="text-jj-yellow underline">cadastre uma marca</Link>.</p> : <form onSubmit={salvar} className="mt-5"><fieldset disabled={!!busy} className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="produto-nome" className="field-label">Nome do produto</label><input id="produto-nome" className="input" maxLength={160} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Conector 221" /></div>
        <div><label htmlFor="produto-marca" className="field-label">Marca campanha</label><select id="produto-marca" className="input" required value={form.marca_id} onChange={(e) => setForm({ ...form, marca_id: e.target.value })}><option value="">Selecione uma marca</option>{marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
        <div><label htmlFor="produto-pontos" className="field-label">Preço de venda (R$)</label><input id="produto-pontos" className="input" required inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="Ex.: 6,99" aria-describedby="pontos-ajuda" /><p id="pontos-ajuda" className="mt-2 text-xs text-white/60">Preço do catálogo, para consulta. Os pontos usam o valor líquido da venda importada.</p></div>
        <div><label htmlFor="produto-regra" className="field-label">Pontos por R$ 1 vendido</label><input id="produto-regra" className="input" required inputMode="decimal" value={form.pontos} onChange={(e) => setForm({ ...form, pontos: e.target.value })} placeholder="Ex.: 1,5" /><p className="mt-2 text-xs text-white/60">Ex.: 1,5 significa 150 pontos em uma venda líquida de R$ 100.</p></div>
        <div><label htmlFor="produto-codigo" className="field-label">Código externo (opcional)</label><input id="produto-codigo" className="input" value={form.codigo_externo} onChange={(e) => setForm({ ...form, codigo_externo: e.target.value })} placeholder="Código do produto no seu sistema" /></div>
        {editando && <p className="text-sm leading-6 text-white/65 sm:col-span-2">Alterar os pontos por real recalcula a pontuação dos lançamentos vinculados a este produto. Os valores de faturamento permanecem iguais.</p>}
        <div className="flex flex-wrap gap-3 sm:col-span-2"><button type="submit" className="btn-primary">{busy === "form" ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar produto"}</button>{editando && <button type="button" className="btn-ghost" onClick={limpar}>Cancelar edição</button>}</div>
      </fieldset></form>}
    </section>

    <section className="card mt-5 p-5 sm:p-6" aria-labelledby="importar-produtos">
      <h2 id="importar-produtos" className="text-lg font-semibold">Cadastrar vários produtos por planilha</h2>
      <p className="mt-2 text-sm leading-6 text-white/65">Use sua planilha com <strong className="text-white">Descrição, Código, Preço Venda e pontos x R$</strong>. Se não houver a coluna Marca campanha, selecione a marca abaixo. Confira antes de confirmar.</p>
      <div className="mt-4 max-w-md"><label htmlFor="marca-importacao" className="field-label">Marca para as linhas sem marca</label><select id="marca-importacao" className="input" disabled={!!busy} value={marcaImportacao} onChange={(e) => { const marca = e.target.value; setMarcaImportacao(marca); if (fileRef.current) void abrir(fileRef.current, marca); }}><option value="">Selecione se a planilha não tiver marca</option>{marcas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="btn-ghost" disabled={!!busy || !marcas.length} onClick={modelo}>Baixar modelo de produtos</button><button type="button" className="btn-primary" disabled={!!busy || !marcas.length} onClick={() => arquivoRef.current?.click()}>{busy === "leitura" ? "Conferindo arquivo…" : "Selecionar planilha de produtos"}</button><input ref={arquivoRef} type="file" accept=".xlsx" aria-label="Planilha de produtos" className="hidden" disabled={!!busy} onChange={(e) => { void abrir(e.target.files?.[0]); e.target.value = ""; }} /></div>
      <p className="mt-3 text-xs text-white/60">.xlsx · até 5 MB · 5.000 produtos. Uma linha por produto. A marca pode ser informada por nome, código ou ID.</p>
      <details className="mt-4 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm font-medium">Como funcionam a identificação e a atualização?</summary><div className="mt-3 space-y-2 text-sm leading-6 text-white/65"><p>O mesmo código ou nome na mesma marca atualiza o cadastro. Códigos preservam a identificação mesmo se a descrição mudar. Marcas desconhecidas precisam ser cadastradas primeiro.</p><p>pontos x R$ é o multiplicador do valor líquido vendido. Ex.: R$ 100 × 1,5 = 150 pontos. Preço Venda é apenas uma referência do catálogo. A quantidade não multiplica os pontos novamente. Alterar o fator recalcula as vendas vinculadas.</p><p>Uma venda só é importada quando seu produto está cadastrado e ativo na marca informada. Vendas pendentes ou totalmente canceladas não somam pontos. Devoluções e cancelamentos parciais reduzem o valor líquido usado para calcular os pontos.</p></div></details>
      {arquivo && <p className="mt-4 break-all text-sm text-white/70">Arquivo: {arquivo}</p>}
      {!!linhas.length && <div className="mt-4 border-t border-white/10 pt-4">
        <h3 className="font-semibold">{erros.length ? `${erros.length} linhas precisam de correção` : `${linhas.length} produtos prontos para importar`}</h3>
        <p className="mt-2 text-sm text-white/65">{erros.length ? "Corrija as linhas abaixo no Excel, salve e selecione a planilha novamente. Nenhum produto foi salvo." : `${linhas.filter((l) => l.acao === "Cadastrar").length} novos e ${linhas.filter((l) => l.acao === "Atualizar").length} atualizações. Confira os pontos antes de confirmar.`}</p>
        <ul className="mt-4 space-y-2">{revisao.slice((pagina - 1) * 30, pagina * 30).map((l) => <li key={l.linha} className={`rounded-lg border p-3 ${l.erro ? "border-red-400/30 bg-red-400/5" : "border-white/10"}`}><div className="flex flex-wrap justify-between gap-2"><p className="break-words text-sm font-medium">Linha {l.linha} · {l.nome || "Sem nome"}</p><span className="text-sm text-jj-yellow">{descreverRegra(l)}</span></div><p className="mt-1 text-xs text-white/60">{l.marca_nome} · {l.codigo_externo ? `Código ${l.codigo_externo} · ` : ""}{l.acao}</p>{l.erro && <p className="mt-2 text-sm text-red-200">{l.erro}</p>}</li>)}</ul>
        {paginas > 1 && <div className="mt-3 flex items-center justify-between gap-3"><button type="button" className="btn-ghost" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button><span className="text-xs">{pagina} de {paginas}</span><button type="button" className="btn-ghost" disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)}>Próxima</button></div>}
        <button type="button" className="btn-primary mt-4" disabled={!!busy || !!erros.length} onClick={() => void importar()}>{busy === "importacao" ? "Importando…" : erros.length ? "Corrija as linhas para continuar" : `Confirmar importação de ${linhas.length} produtos`}</button>
      </div>}
    </section>

    {erro && <p role="alert" className="error-message mt-4">{erro}</p>}{sucesso && <p role="status" className="success-message mt-4">{sucesso}</p>}
    <div className="mb-4 mt-7 flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-semibold">Produtos cadastrados <span className="text-sm font-normal text-white/60">({produtos.length})</span></h2><div className="w-full sm:w-72"><label htmlFor="buscar-produtos" className="sr-only">Buscar produto, código ou marca</label><input id="buscar-produtos" type="search" className="input" placeholder="Buscar produto, código ou marca" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
    {!lista.length ? <p className="empty-state text-sm text-white/65">{produtos.length ? "Nenhum produto encontrado." : "Cadastre um produto ou importe sua planilha para começar."}</p> : <div className="space-y-3">{lista.map((p) => <article key={p.id} className="card flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-0"><h3 className="break-words font-semibold">{p.nome}</h3><p className="mt-1 text-xs text-white/60">{marcas.find((m) => m.id === p.marca_id)?.nome || p.marca_nome}{p.codigo_externo ? ` · Código ${p.codigo_externo}` : ""}{p.ativo === false ? " · Inativo" : ""}</p><p className="mt-2 font-semibold text-jj-yellow">{descreverRegra(p)}</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><button type="button" className="btn-ghost" disabled={!!busy} onClick={() => editar(p)}>Editar produto e pontos</button><button type="button" className="btn-ghost" disabled={!!busy} onClick={() => void alternar(p)}>{busy === p.id ? "Salvando…" : p.ativo === false ? "Ativar" : "Desativar"}</button><button type="button" className="btn-danger-outline" disabled={!!busy} onClick={() => { setExcluindo(p); setErroExclusao(""); }}>Excluir produto</button></div></article>)}</div>}
    <ConfirmDelete tipo="produto" nome={excluindo?.nome || null} busy={busy === "exclusao"} error={erroExclusao} onCancel={() => setExcluindo(null)} onConfirm={() => void confirmarExclusao()} />
  </AppShell>;
}
