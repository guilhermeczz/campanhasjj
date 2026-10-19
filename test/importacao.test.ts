import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNumeroBR, validarLinhas, type CadastrosImportacao } from "../lib/importacao";
import { criarModelo, lerPlanilha } from "../lib/excel";
import * as XLSX from "xlsx";
import { CAMPOS_PLANILHA, MODELO_VENDAS, chaveDoCabecalho } from "../lib/importacaoGuia";

const cadastros: CadastrosImportacao = {
  vendedores: [
    { id: "v1", username: "joao.silva", nome: "João Silva", ativo: true, role: "vendedor" },
    { id: "v2", username: "maria.souza", nome: "Maria Souza", ativo: false, role: "vendedor" },
    { id: "admin", username: "admin", nome: "Diretoria", ativo: true, role: "admin" }
  ],
  categorias: [
    { id: "c1", nome: "Tubos", ativa: true },
    { id: "c2", nome: "Conexões", ativa: true }
  ]
};

const titulos = CAMPOS_PLANILHA.map((campo) => campo.titulo);
function linha(overrides: Record<string, unknown> = {}) {
  const valores: Record<string, unknown> = { Vendedor: "joao.silva", "Valor Vendido": "1.000,50", Categoria: "Tubos", ...overrides };
  return titulos.map((titulo) => valores[titulo]);
}
function validar(overrides: Record<string, unknown> = {}) {
  return validarLinhas([titulos, linha(overrides)], cadastros);
}
function arquivo(wb: XLSX.WorkBook) {
  return new File([new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))], "vendas.xlsx");
}

test("parseNumeroBR aceita decimais brasileiros, ponto e vírgula e rejeita texto inválido", () => {
  assert.equal(parseNumeroBR("R$ 1.234,56"), 1234.56);
  assert.equal(parseNumeroBR("1234.56"), 1234.56);
  assert.equal(parseNumeroBR("1000,5"), 1000.5);
  assert.equal(parseNumeroBR(250), 250);
  assert.equal(parseNumeroBR(0), 0);
  for (const valor of ["", "1,2,3", "abc", null, undefined, Infinity, NaN, {}]) assert.equal(parseNumeroBR(valor), null);
});

test("linha válida resolve vendedor, categoria e valor por nome", () => {
  const [linha1] = validar();
  assert.equal(linha1.erro, undefined);
  assert.equal(linha1.vendedor, "joao.silva");
  assert.equal(linha1.vendedor_nome, "João Silva");
  assert.equal(linha1.vendedor_id, "v1");
  assert.equal(linha1.categoria, "Tubos");
  assert.equal(linha1.valor_vendido, 1000.5);
  assert.equal(linha1.linha, 2);
});

test("vendedor pode ser informado pelo nome completo e categoria sem acento no cabeçalho", () => {
  const titulosNormalizados = ["VENDEDOR", "VALOR VENDIDO", "CATEGORIA"];
  const [r] = validarLinhas([titulosNormalizados, ["João Silva", 500, "Conexões"]], cadastros);
  assert.equal(r.erro, undefined);
  assert.equal(r.vendedor, "joao.silva");
  assert.equal(r.categoria, "Conexões");
});

test("vendedor inexistente, inativo ou diretoria é bloqueado", () => {
  for (const vendedor of ["nao.existe", "maria.souza", "admin"]) {
    assert.match(validar({ Vendedor: vendedor })[0].erro!, /Vendedor/);
  }
});

test("categoria não cadastrada bloqueia a linha", () => {
  assert.match(validar({ Categoria: "Elétrica" })[0].erro!, /não cadastrada/);
});

test("valor presente, negativo, com três casas ou texto é rejeitado", () => {
  for (const [valor, msg] of [["", /Valor Vendido/], ["-1", /Valor Vendido/], [12.345, /Valor Vendido/], ["abc", /Valor Vendido/]] as const) {
    assert.match(validar({ "Valor Vendido": valor })[0].erro!, msg);
  }
  assert.equal(validar({ "Valor Vendido": 0 })[0].erro, undefined);
  assert.equal(validar({ "Valor Vendido": 0 })[0].valor_vendido, 0);
});

test("linhas em branco são ignoradas e a numeração acompanha a planilha", () => {
  const rows = validarLinhas([titulos, linha(), [], ["", "", ""], linha({ Vendedor: "nao.existe" })], cadastros);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].linha, 2);
  assert.equal(rows[1].linha, 5);
  assert.ok(rows[1].erro);
});

test("planilha vazia, cabeçalho incompleto ou repetido são rejeitados", () => {
  assert.throws(() => validarLinhas([], cadastros), /vazia/);
  assert.throws(() => validarLinhas([titulos], cadastros), /não tem dados/);
  assert.throws(() => validarLinhas([["Vendedor"], linha()], cadastros), /Colunas obrigatórias/);
  assert.throws(() => validarLinhas([[...titulos, "Categoria"], linha()], cadastros), /colunas repetidas/);
});

test("acima de 5.000 linhas a importação é recusada", () => {
  const tabela = [titulos, ...Array.from({ length: 5001 }, () => linha())];
  assert.throws(() => validarLinhas(tabela, cadastros), /5.000/);
});

test("modelo Excel tem a aba Vendas, três colunas, sem exemplos", async () => {
  const wb = criarModelo();
  assert.deepEqual(wb.SheetNames, ["Vendas"]);
  assert.deepEqual([...MODELO_VENDAS], ["vendedor", "valor_vendido", "categoria"]);
  assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets.Vendas, { header: 1 }), [titulos]);
  await assert.rejects(lerPlanilha(arquivo(wb), cadastros), /não tem dados/);
  XLSX.utils.sheet_add_aoa(wb.Sheets.Vendas, [linha()], { origin: "A2" });
  const rows = await lerPlanilha(arquivo(wb), cadastros);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].erro, undefined);
  assert.equal(rows[0].valor_vendido, 1000.5);
});

test("leitura exige .xlsx, aba Vendas e bloqueia fórmulas", async () => {
  await assert.rejects(lerPlanilha(new File([new Uint8Array()], "vendas.xls"), cadastros), /\.xlsx/);
  const semAba = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(semAba, XLSX.utils.aoa_to_sheet([titulos]), "Planilha1");
  await assert.rejects(lerPlanilha(arquivo(semAba), cadastros), /aba Vendas/);
  const wb = criarModelo();
  XLSX.utils.sheet_add_aoa(wb.Sheets.Vendas, [linha()], { origin: "A2" });
  wb.Sheets.Vendas.B2 = { t: "n", v: 1000, f: "500+500" };
  await assert.rejects(lerPlanilha(arquivo(wb), cadastros), /fórmulas/);
});

test("chaveDoCabecalho reconhece títulos com acento e caixa diferente", () => {
  assert.equal(chaveDoCabecalho("Valor Vendido"), "valor_vendido");
  assert.equal(chaveDoCabecalho("  VENDEDOR "), "vendedor");
  assert.equal(chaveDoCabecalho("Categoria"), "categoria");
  assert.equal(chaveDoCabecalho("Desconhecida"), "desconhecida");
});
