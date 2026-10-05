import assert from "node:assert/strict";
import { test } from "node:test";
import { EXCEL_HEADERS_COPA, parseDataFaturamento, parseNumeroBR, validarLinhasCopa, type CadastrosImportacao } from "../lib/importacao";
import { criarModeloCopa, lerPlanilhaCopa } from "../lib/excel";
import * as XLSX from "xlsx";
import { CAMPOS_PLANILHA } from "../lib/importacaoGuia";

const cadastros: CadastrosImportacao = {
  vendedores: [{ id: "vendedor-1", username: "joao.silva", nome: "João Silva", ativo: true, role: "vendedor" }],
  marcas: [{ id: "marca-1", nome: "WAGO", codigo_externo: "001", ativa: true }, { id: "marca-2", nome: "Outra", codigo_externo: "002", ativa: true }],
  produtos: [{ id: "produto-1", nome: "Conector", marca_id: "marca-1", marca_nome: "WAGO", valor_por_ponto: 200, ativo: true }, { id: "produto-2", nome: "Conector", marca_id: "marca-2", marca_nome: "Outra", valor_por_ponto: 100, ativo: true }],
  campanhas: [{ id: "campanha-1", nome: "WAGO", descricao: "", marca_id: "marca-1", ativa: true, tipo: "faturamento_marca", data_inicio: "2026-10-01", data_fim: "2026-12-31" }]
};
const original = ["NF-1-1", "joao.silva", "Conector", 2, "001", "01/10/2026 00:00:00", "1.000,50", "100,50", 0, "000123", "faturado"];
function linha(overrides: Record<string, unknown> = {}) {
  return EXCEL_HEADERS_COPA.map((campo, i) => campo in overrides ? overrides[campo] : original[i]);
}
function validar(overrides: Record<string, unknown> = {}) {
  return validarLinhasCopa([[...EXCEL_HEADERS_COPA], linha(overrides)], cadastros)[0];
}
function linhaModelo(overrides: Record<string, unknown> = {}) {
  const values = Object.fromEntries(EXCEL_HEADERS_COPA.map((campo, i) => [campo, original[i]]));
  return CAMPOS_PLANILHA.map((campo) => campo.chave in overrides ? overrides[campo.chave] : values[campo.chave]);
}
function arquivo(wb: XLSX.WorkBook) {
  return new File([new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))], "vendas.xlsx");
}

test("valores brasileiros e decimais preservam centavos e rejeitam texto inválido", () => {
  assert.equal(parseNumeroBR("R$ 1.234,56"), 1234.56);
  assert.equal(parseNumeroBR("1234.56"), 1234.56);
  for (const value of ["", "1,2,3", "abc", null, Infinity, NaN]) assert.equal(parseNumeroBR(value), null);
  assert.equal(validar().faturamento_liquido, 900);
  for (const valor_bruto of ["", "abc", -1, 12.345]) assert.match(validar({ valor_bruto }).erro!, /Valor da venda/);
});

test("datas de Excel e texto respeitam São Paulo e rejeitam dias inexistentes", () => {
  assert.equal(parseDataFaturamento("01/10/2026 00:00:00"), "2026-10-01T03:00:00.000Z");
  assert.equal(parseDataFaturamento("2026-10-01T00:00:00-03:00"), "2026-10-01T03:00:00.000Z");
  assert.equal(parseDataFaturamento(1), "1900-01-01T03:00:00.000Z");
  for (const date of [60, "30/02/2026", "2026-10-01T24:00:00", "2026-10-01T00:00:00+14:30", "inválida"]) assert.equal(parseDataFaturamento(date), null);
});

test("marca é resolvida pelo código e limites de campanha não incluem janeiro", () => {
  const result = validar();
  assert.equal(result.erro, undefined);
  assert.equal(result.marca_id, "marca-1");
  assert.equal(result.cliente_id, "000123");
  assert.equal(result.campanha, "WAGO");
  assert.equal(validar({ data_faturamento: "31/12/2026 23:59:59.999" }).campanha, "WAGO");
  assert.equal(validar({ data_faturamento: "01/01/2027" }).destino, "Fora do período");
  assert.equal(validar({ marca_id: "002" }).destino, "Somente desempate");
  assert.match(validar({ marca_id: "WAGO" }).erro!, /Código da marca: não encontrado/);
});

test("itens repetidos indicam todas as linhas e impedem uma importação silenciosa", () => {
  const rows = validarLinhasCopa([[...EXCEL_HEADERS_COPA], linha(), [], linha()], cadastros);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.erro?.includes("linhas 2, 4")));
});

test("cabeçalhos incompletos ou repetidos e planilha vazia são rejeitados", () => {
  assert.throws(() => validarLinhasCopa([], cadastros), /vazia/);
  assert.throws(() => validarLinhasCopa([[...EXCEL_HEADERS_COPA]], cadastros), /não tem dados/);
  assert.throws(() => validarLinhasCopa([["vendedor"], linha()], cadastros), /Colunas obrigatórias/);
  assert.throws(() => validarLinhasCopa([[...EXCEL_HEADERS_COPA, "item_id"], linha()], cadastros), /colunas repetidas/);
});

test("abatimentos, cliente e status são validados antes do envio", () => {
  assert.match(validar({ valor_bruto: 100, valor_devolucao: 60, valor_cancelamento: 50 }).erro!, /superar/);
  assert.match(validar({ cliente_id: "" }).erro!, /Código do cliente: preencha/);
  assert.match(validar({ status: "orçamento" }).erro!, /Situação: use/);
  assert.equal(validar({ status: "cancelado" }).faturamento_liquido, 0);
  assert.equal(validar({ status: "pendente" }).faturamento_liquido, 0);
});

test("modelo de vendas contém somente uma aba com cabeçalhos e nenhum exemplo ou explicação", async () => {
  const wb = criarModeloCopa(cadastros);
  assert.deepEqual(wb.SheetNames, ["Vendas"]);
  assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets.Vendas, { header: 1 }), [CAMPOS_PLANILHA.map(c => c.titulo)]);
  await assert.rejects(lerPlanilhaCopa(arquivo(wb), cadastros), /não tem dados/);
  XLSX.utils.sheet_add_aoa(wb.Sheets.Vendas, [linhaModelo()], { origin: "A2" });
  const rows = await lerPlanilhaCopa(arquivo(wb), cadastros);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].erro, undefined);
});

test("leitura do Excel preserva zeros de códigos e bloqueia fórmulas", async () => {
  const wb = criarModeloCopa(cadastros);
  XLSX.utils.sheet_add_aoa(wb.Sheets.Vendas, [linhaModelo()], { origin: "A2" });
  wb.Sheets.Vendas.H2 = { t: "n", v: 123, z: "000000" };
  assert.equal((await lerPlanilhaCopa(arquivo(wb), cadastros))[0].cliente_id, "000123");
  wb.Sheets.Vendas.G2 = { t: "n", v: 1000, f: "500+500" };
  await assert.rejects(lerPlanilhaCopa(arquivo(wb), cadastros), /fórmulas/);
});

test("modelo simplificado aceita 7 campos e preenche valores opcionais com segurança", async () => {
  const obrigatorios = CAMPOS_PLANILHA.filter((campo) => !campo.opcional);
  const valores = linhaModelo({ valor_devolucao: "", valor_cancelamento: "", status: "" });
  assert.equal(obrigatorios.length, 7);
  const result = validarLinhasCopa([obrigatorios.map((campo) => campo.titulo), valores.filter((_, i) => !CAMPOS_PLANILHA[i].opcional)], cadastros)[0];
  assert.equal(result.erro, undefined);
  assert.equal(result.valor_devolucao, 0);
  assert.equal(result.valor_cancelamento, 0);
  assert.equal(result.status, "faturado");
  assert.equal(result.faturamento_liquido, 1000.5);
  const wb = criarModeloCopa(cadastros);
  XLSX.utils.sheet_add_aoa(wb.Sheets.Vendas, [valores], { origin: "A2" });
  const [lida] = await lerPlanilhaCopa(arquivo(wb), cadastros);
  assert.equal(lida.erro, undefined);
  assert.equal(lida.faturamento_liquido, 1000.5);
  assert.equal(lida.cliente_id, "000123");
});

test("data ausente ou vazia usa um único instante de importação e respeita o período em São Paulo", () => {
  const semData = EXCEL_HEADERS_COPA.filter(c => c !== "data_faturamento");
  const valores = linha().filter((_, i) => EXCEL_HEADERS_COPA[i] !== "data_faturamento");
  const [fora] = validarLinhasCopa([semData, valores], cadastros, "2026-10-01T02:59:59.999Z");
  assert.equal(fora.erro, undefined);
  assert.equal(fora.destino, "Fora do período");
  for (const vazio of [undefined, null, "", "   "]) {
    const [a, b] = validarLinhasCopa([[...EXCEL_HEADERS_COPA], linha({ data_faturamento: vazio }), linha({ item_id: "NF-2", data_faturamento: vazio })], cadastros, "2026-10-01T03:00:00.000Z");
    assert.equal(a.erro, undefined);
    assert.equal(a.data_faturamento, "2026-10-01T03:00:00.000Z");
    assert.equal(b.data_faturamento, a.data_faturamento);
    assert.equal(a.campanha, "WAGO");
    assert.equal(a.origem_data, "importacao");
  }
});

test("reenvio sem data mantém a anterior; data preenchida prevalece e data inválida bloqueia", () => {
  const existentes = { ...cadastros, vendas: [{ item_id: "NF-1-1", data_faturamento: "2026-11-10T15:00:00.123456Z" }] };
  const revisar = (valor: unknown) => validarLinhasCopa([[...EXCEL_HEADERS_COPA], linha({ data_faturamento: valor })], existentes, "2027-01-01T12:00:00.000Z")[0];
  const anterior = revisar("");
  assert.equal(anterior.erro, undefined);
  assert.equal(anterior.data_faturamento, "2026-11-10T15:00:00.123Z");
  assert.equal(anterior.campanha, "WAGO");
  assert.equal(anterior.origem_data, "cadastro");
  assert.equal(revisar("01/01/2027").destino, "Fora do período");
  assert.equal(revisar("01/01/2027").origem_data, "planilha");
  for (const invalido of ["30/02/2026", "texto", false, 0]) assert.match(revisar(invalido).erro!, /Data do faturamento/);
});

test("arquivo Excel aceita remover a coluna de data completamente", async () => {
  const wb = XLSX.utils.book_new();
  const indices = CAMPOS_PLANILHA.map((c, i) => c.chave === "data_faturamento" ? -1 : i).filter(i => i >= 0);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    indices.map(i => CAMPOS_PLANILHA[i].titulo), indices.map(i => linhaModelo()[i]),
  ]), "Vendas");
  const [lida] = await lerPlanilhaCopa(arquivo(wb), cadastros);
  assert.equal(lida.erro, undefined);
  assert.equal(lida.origem_data, "importacao");
  assert.ok(Number.isFinite(Date.parse(lida.data_faturamento)));
});

test("cabeçalhos antigos continuam aceitos e aliases repetidos são rejeitados", () => {
  assert.equal(validar().erro, undefined);
  assert.throws(() => validarLinhasCopa([[...EXCEL_HEADERS_COPA, "Código da marca"], linha()], cadastros), /colunas repetidas/);
  const headers = CAMPOS_PLANILHA.map((campo) => campo.titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase());
  assert.equal(validarLinhasCopa([headers, linhaModelo()], cadastros)[0].erro, undefined);
  assert.match(validar({ valor_devolucao: "abc" }).erro!, /Devolução/);
});

test("prévia de pontos usa valor líquido e rejeita produto sem cadastro ou regra", () => {
  assert.equal(validar({ valor_bruto: 300, valor_devolucao: 0, quantidade: 99 }).pontos, 1.5);
  assert.equal(validar({ valor_bruto: 600, valor_devolucao: 200 }).pontos, 2);
  assert.equal(validar({ valor_bruto: 123.45, valor_devolucao: 0 }).pontos, 0.62);
  assert.equal(validar({ valor_bruto: 201, valor_devolucao: 0 }).pontos, 1.01);
  assert.equal(validar({ status: "cancelado" }).pontos, 0);
  assert.match(validar({ produto: "Desconhecido" }).erro!, /Produto: não cadastrado/);
  const semRegra = { ...cadastros, produtos: cadastros.produtos.map((p) => ({ ...p, valor_por_ponto: null })) };
  assert.match(validarLinhasCopa([[...EXCEL_HEADERS_COPA], linha()], semRegra)[0].erro!, /configure/);
});

test("prévia multiplica valor líquido pelo fator, identifica por código e ignora preço do catálogo", () => {
  const comReferencia = { ...cadastros, produtos: [{ ...cadastros.produtos[0], codigo_externo: "0002", valor_por_ponto: null, preco_venda: 6.99, pontos_por_real: 1.5 }] };
  const [r] = validarLinhasCopa([[...EXCEL_HEADERS_COPA], linha({ produto: "0002", valor_bruto: 20.97, valor_devolucao: 6.99, quantidade: 999 })], comReferencia);
  assert.equal(r.erro, undefined);
  assert.equal(r.pontos, 20.97);
  assert.equal(r.preco_venda, 6.99);
  assert.equal(r.pontos_por_real, 1.5);
});
