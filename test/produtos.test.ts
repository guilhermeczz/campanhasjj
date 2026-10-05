import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { COLUNAS_PRODUTOS, lerProdutos, modeloProdutos, validarProdutos } from "../lib/produtosExcel";
import type { Marca, Produto } from "../lib/types";
import { calcularPontosProduto } from "../lib/pontuacao";

const marcas: Marca[] = [{ id: "marca-1", nome: "WAGO", codigo_externo: "001" }, { id: "marca-2", nome: "Outra marca", codigo_externo: "002" }];
const produtos: Produto[] = [{ id: "produto-1", nome: "Conector", marca_id: "marca-1", marca_nome: "WAGO", valor_por_ponto: 200 }];
const antigas = ["Nome do produto", "Marca campanha", "Ponto por valor"];
const validar = (linhas: unknown[][]) => validarProdutos([antigas, ...linhas], marcas, produtos);
function arquivo(wb: XLSX.WorkBook, name = "produtos.xlsx") {
  return new File([new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))], name);
}

test("produto é identificado por nome e marca e a regra aceita moeda brasileira", () => {
  const rows = validar([["Conector", "wago", "R$ 200,00"], ["Novo produto", "002", "100,50"], ["Outro", "marca-1", 300]]);
  assert.ok(rows.every((r) => !r.erro));
  assert.deepEqual(rows.map((r) => r.acao), ["Atualizar", "Cadastrar", "Cadastrar"]);
  assert.deepEqual(rows.map((r) => r.valor_por_ponto), [200, 100.5, 300]);
});

test("regra sem valor, zero, negativa ou com precisão inválida é rejeitada", () => {
  for (const valor of ["", 0, -1, 1.234, "abc", Infinity]) assert.match(validar([["Produto", "WAGO", valor]])[0].erro!, /Ponto por valor/);
});

test("marca não cadastrada e nomes repetidos bloqueiam importação sem sobrescrever", () => {
  assert.match(validar([["Produto", "Desconhecida", 200]])[0].erro!, /Marca: não encontrada/);
  const repetidos = validar([["Produto", "WAGO", 200], [" produto ", "001", 100]]);
  assert.ok(repetidos.every((p) => p.erro?.includes("linhas 2, 3")));
  assert.ok(validar([["Produto", "WAGO", 200], ["Produto", "Outra marca", 100]]).every((p) => !p.erro));
});

test("cabeçalho antigo de pontos por quantidade não é interpretado como regra monetária", () => {
  assert.throws(() => validarProdutos([["Nome do produto", "Marca", "Pontos equivalentes"], ["Produto", "WAGO", 10]], marcas, produtos), /Ponto por valor/);
  assert.throws(() => validarProdutos([[...antigas, "valor_por_ponto"], ["Produto", "WAGO", 200]], marcas, produtos), /repetidas/);
});

test("modelo exportado contém preço e multiplicador e não importa seus exemplos", async () => {
  const wb = modeloProdutos(marcas);
  assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets.Produtos, { header: 1 })[0], COLUNAS_PRODUTOS);
  await assert.rejects(lerProdutos(arquivo(wb), marcas, produtos), /não tem dados/);
  XLSX.utils.sheet_add_aoa(wb.Sheets.Produtos, [["Conector", "0002", 6.99, 1.5, "WAGO"]], { origin: "A2" });
  const rows = await lerProdutos(arquivo(wb), marcas, produtos);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].preco_venda, 6.99);
  assert.equal(rows[0].pontos_por_real, 1.5);
  assert.equal(rows[0].codigo_externo, "0002");
  assert.equal(calcularPontosProduto(100, rows[0]), 150);
  assert.equal(rows[0].erro, undefined);
});

test("relatório com nome de aba livre usa marca selecionada e preserva códigos formatados", async () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLUNAS_PRODUTOS.slice(0,4), ["Produto", 2, 6.99, 1.5]]);
  ws.B2.z = "0000";
  XLSX.utils.book_append_sheet(wb, ws, "vendas e nf-e");
  const semMarca = await lerProdutos(arquivo(wb), marcas, []);
  assert.match(semMarca[0].erro!, /selecione a marca/);
  const [r] = await lerProdutos(arquivo(wb), marcas, [], "marca-1");
  assert.equal(r.erro, undefined);
  assert.equal(r.codigo_externo, "0002");
  assert.equal(r.marca_id, "marca-1");
  assert.equal(calcularPontosProduto(100, r), 150);
  assert.equal(calcularPontosProduto(6.99, r), 10.49);
  assert.equal(calcularPontosProduto(100, { ...r, preco_venda: 999 }), 150);
  assert.equal(calcularPontosProduto(100, { ...r, pontos_por_real: 1 }), 100);
});

test("códigos duplicados e conflitos entre código e nome bloqueiam o lote", () => {
  const rows = validarProdutos([COLUNAS_PRODUTOS, ["A", "002", 6.99, 1.5, "WAGO"], ["B", "002", 9.99, 1, "WAGO"]], marcas, []);
  assert.ok(rows.every(r => r.erro?.includes("repetido")));
  const catalogo = [{ ...produtos[0], codigo_externo: "001" }, { ...produtos[0], id: "outro", nome: "Outro", codigo_externo: "002" }];
  assert.match(validarProdutos([COLUNAS_PRODUTOS, ["Conector", "002", 6.99, 1.5, "WAGO"]], marcas, catalogo)[0].erro!, /diferentes/);
  const [update] = validarProdutos([COLUNAS_PRODUTOS, ["Novo nome", "001", 6.99, 1.5, "WAGO"]], marcas, catalogo);
  assert.equal(update.acao, "Atualizar");
  assert.equal(update.erro, undefined);
});

test("preço e fator inválidos não são aceitos e marca explícita não é substituída", () => {
  for (const valor of [0, -1, "", 1.234, "abc"]) {
    assert.ok(validarProdutos([COLUNAS_PRODUTOS, ["A", "1", valor, 1.5, "WAGO"]], marcas, [])[0].erro);
    assert.ok(validarProdutos([COLUNAS_PRODUTOS, ["A", "1", 6.99, valor, "WAGO"]], marcas, [])[0].erro);
  }
  assert.equal(validarProdutos([COLUNAS_PRODUTOS, ["A", "1", 6.99, 1.5, "Outra marca"]], marcas, [], "marca-1")[0].marca_id, "marca-2");
  assert.throws(() => validarProdutos([[...COLUNAS_PRODUTOS, "Ponto por valor"]], marcas, []), /Não misture/);
});

test("leitura rejeita fórmulas, aba ausente e formato diferente de xlsx", async () => {
  const wb = modeloProdutos(marcas);
  XLSX.utils.sheet_add_aoa(wb.Sheets.Produtos, [["Conector", "WAGO", 200]], { origin: "A2" });
  wb.Sheets.Produtos.C2.f = "100+100";
  await assert.rejects(lerProdutos(arquivo(wb), marcas, produtos), /fórmulas/);
  await assert.rejects(lerProdutos(arquivo(wb, "produtos.csv"), marcas, produtos), /xlsx/);
  wb.SheetNames = ["Exemplo", "Marcas"];
  await assert.rejects(lerProdutos(arquivo(wb), marcas, produtos), /aba Produtos/);
});
