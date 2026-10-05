import * as XLSX from "xlsx";
import type { Marca, Produto } from "./types";
import { LIMITE_ARQUIVO, LIMITE_LINHAS, parseNumeroBR } from "./importacao";
import { normalizarCabecalho } from "./importacaoGuia";

export const COLUNAS_PRODUTOS = ["Descrição", "Código", "Preço Venda", "pontos x R$", "Marca campanha"];
export interface ProdutoImportado {
  linha: number; nome: string; marca_id: string; marca_nome: string; codigo_externo?: string;
  valor_por_ponto: number | null; preco_venda?: number; pontos_por_real?: number;
  acao: "Cadastrar" | "Atualizar"; erro?: string;
}
const alias: Record<string, string> = {
  nome: "nome", produto: "nome", descricao: "nome", "nome do produto": "nome", nome_do_produto: "nome",
  marca: "marca", "marca campanha": "marca", marca_campanha: "marca",
  ponto_por_valor: "regra", valor_por_ponto: "regra", "ponto por valor": "regra", "ponto por valor (r$)": "regra",
  codigo: "codigo", "codigo externo": "codigo", codigo_externo: "codigo", "codigo do produto": "codigo",
  "preco venda": "preco", "preco de venda": "preco", "preco de referencia": "preco",
  "pontos x r$": "pontos", "pontos por real": "pontos", "pontos por r$ 1 vendido": "pontos", pontos_por_real: "pontos",
};
const chave = (v: unknown) => { const texto = normalizarCabecalho(String(v ?? "")); return alias[texto] || texto; };
const numeroValido = (v: number | null) => v !== null && Number.isFinite(v) && v > 0 && v < 10000000000 && Math.abs(v * 100 - Math.round(v * 100)) < 0.00001;

export function validarProdutos(tabela: unknown[][], marcas: Marca[], produtos: Produto[], marcaPadrao = ""): ProdutoImportado[] {
  if (!tabela.length) throw new Error("A planilha está vazia. Preencha a aba Produtos do modelo.");
  const headers = tabela[0].map(chave);
  if (["nome", "marca", "regra", "codigo", "preco", "pontos"].some(c => headers.filter(h => h === c).length > 1)) throw new Error("Há colunas repetidas. Mantenha uma coluna para cada campo do modelo.");
  const referencia = headers.includes("preco") || headers.includes("pontos");
  if (!headers.includes("nome") || (referencia ? !headers.includes("preco") || !headers.includes("pontos") : !headers.includes("regra"))) {
    throw new Error("Use Descrição, Código, Preço Venda e pontos x R$. O modelo anterior com Nome do produto, Marca campanha e Ponto por valor também é aceito.");
  }
  if (referencia && headers.includes("regra")) throw new Error("Use apenas uma regra: Preço Venda + pontos x R$, ou Ponto por valor. Não misture as duas no mesmo arquivo.");
  const linhas = tabela.slice(1).map((cells, i) => ({ cells, linha: i + 2 })).filter(({ cells }) => cells.some(v => v != null && String(v).trim()));
  if (!linhas.length) throw new Error("A aba Produtos ainda não tem dados. Preencha os produtos a partir da linha 2.");
  if (linhas.length > LIMITE_LINHAS) throw new Error("Envie até 5.000 produtos por arquivo.");
  const resultado: ProdutoImportado[] = linhas.map(({ cells, linha }) => {
    const campo = (c: string) => cells[headers.indexOf(c)];
    const erros: string[] = [];
    const nome = String(campo("nome") ?? "").trim();
    const codigo = String(campo("codigo") ?? "").trim();
    const marcaInformada = String(campo("marca") ?? "").trim() || marcaPadrao;
    const matches = marcas.filter(m => [m.nome, m.codigo_externo, m.id].some(v => v && normalizarCabecalho(v) === normalizarCabecalho(marcaInformada)));
    const marca = matches.length === 1 ? matches[0] : undefined;
    const preco = parseNumeroBR(campo(referencia ? "preco" : "regra"));
    const pontos = referencia ? parseNumeroBR(campo("pontos")) : 1;
    if (!nome || nome.length > 160) erros.push("Nome do produto: preencha até 160 caracteres");
    if (codigo.length > 160) erros.push("Código: use até 160 caracteres");
    if (!marca) erros.push(!marcaInformada ? "Marca: selecione a marca da campanha acima ou preencha a coluna Marca campanha" : matches.length > 1 ? "Marca: identificação ambígua; copie o ID da aba Marcas" : "Marca: não encontrada; cadastre em Marcas ou copie uma referência do modelo");
    if (!numeroValido(preco)) erros.push(`${referencia ? "Preço Venda" : "Ponto por valor"}: informe um valor maior que zero e com até duas casas decimais`);
    if (!numeroValido(pontos)) erros.push("pontos x R$: informe o multiplicador de pontos por real vendido, maior que zero e com até duas casas decimais");
    const existentes = produtos.filter(p => p.marca_id === marca?.id && (p.nome.trim().toLowerCase() === nome.toLowerCase() || (codigo && p.codigo_externo?.trim().toLowerCase() === codigo.toLowerCase())));
    if (existentes.length > 1) erros.push("Produto: nome e código identificam cadastros diferentes ou duplicados nesta marca; corrija antes de importar");
    return { linha, nome, marca_id: marca?.id || "", marca_nome: marca?.nome || marcaInformada,
      codigo_externo: codigo || undefined, valor_por_ponto: referencia ? null : preco ?? 0,
      ...(referencia ? { preco_venda: preco ?? 0, pontos_por_real: pontos ?? 0 } : {}),
      acao: existentes.length ? "Atualizar" : "Cadastrar", erro: erros.length ? erros.join(" · ") : undefined };
  });
  const repetidos = new Map<string, number[]>();
  const chaves = (p: ProdutoImportado) => [`${p.marca_id}:nome:${p.nome.toLowerCase()}`, ...(p.codigo_externo ? [`${p.marca_id}:codigo:${p.codigo_externo.toLowerCase()}`] : [])];
  for (const item of resultado) for (const k of chaves(item)) repetidos.set(k, [...(repetidos.get(k) || []), item.linha]);
  return resultado.map(item => {
    const linhas = [...new Set(chaves(item).flatMap(k => (repetidos.get(k) || []).length > 1 ? repetidos.get(k)! : []))].sort((a,b) => a-b);
    return linhas.length ? { ...item, erro: [item.erro, `Produto repetido nas linhas ${linhas.join(", ")}; mantenha apenas uma linha por nome ou código na mesma marca`].filter(Boolean).join(" · ") } : item;
  });
}

export function modeloProdutos(marcas: Marca[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([COLUNAS_PRODUTOS]);
  sheet["!cols"] = [{ wch: 55 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, sheet, "Produtos");
  const exemplo = XLSX.utils.aoa_to_sheet([COLUNAS_PRODUTOS, ["Produto de exemplo", "000123", 6.99, 1.5, marcas[0]?.nome || "Marca cadastrada"], [],
    ["COMO PREENCHER"], ["1. Preencha a aba Produtos. Uma linha por produto. Código é opcional; use Texto para preservar zeros."],
    ["2. Preço Venda é referência do catálogo. pontos x R$ multiplica o valor líquido vendido."],
    ["3. Exemplo: R$ 100 vendidos × fator 1,5 = 150 pontos. Fator 1 = 100 pontos."],
    ["4. Marca campanha: preencha nome, código ou ID, ou selecione a marca no site para as linhas sem marca."],
    ["5. Mesmo código ou nome na mesma marca atualiza o cadastro. Confira a revisão antes de confirmar."],
    ["6. Alterar o fator de pontos recalcula vendas vinculadas. O ranking continua por faturamento líquido."],
    ["7. Salve como .xlsx, sem fórmulas. A aba Exemplo não é importada."]]);
  exemplo["!cols"] = [{ wch: 112 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, exemplo, "Exemplo");
  const referencias = XLSX.utils.aoa_to_sheet([["Nome da marca", "Código da marca", "ID da marca"], ...marcas.map(m => [m.nome, m.codigo_externo || "", m.id])]);
  referencias["!cols"] = [{ wch: 32 }, { wch: 32 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, referencias, "Marcas");
  return wb;
}

export function baixarModeloProdutos(marcas: Marca[]) { XLSX.writeFile(modeloProdutos(marcas), "modelo-produtos-jj.xlsx"); }

export async function lerProdutos(file: File, marcas: Marca[], produtos: Produto[], marcaPadrao = "") {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Escolha uma planilha .xlsx. Use o modelo de produtos.");
  if (file.size > LIMITE_ARQUIVO) throw new Error("O arquivo ultrapassa 5 MB. Divida a planilha.");
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(await file.arrayBuffer(), { type: "array", sheetRows: LIMITE_LINHAS + 3 }); }
  catch { throw new Error("Não foi possível abrir a planilha. Salve como .xlsx sem senha e tente novamente."); }
  // Reports may have any sheet name; never select example/reference tabs.
  const candidatas = wb.SheetNames.filter(n => !["exemplo", "marcas"].includes(normalizarCabecalho(n))).filter(n => {
    const headers = (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "" })[0] || []).map(chave);
    return headers.includes("nome") && (headers.includes("regra") || headers.includes("preco") || headers.includes("pontos"));
  });
  const aba = wb.SheetNames.find(n => normalizarCabecalho(n) === "produtos") || (candidatas.length === 1 ? candidatas[0] : undefined);
  if (!aba) throw new Error(candidatas.length > 1 ? "Encontrei várias abas de produtos. Nomeie a aba desejada como Produtos." : "Não encontrei a aba Produtos nem uma tabela com os campos esperados. Use o modelo.");
  const sheet = wb.Sheets[aba];
  const range = sheet["!fullref"] || sheet["!ref"];
  if (range && XLSX.utils.decode_range(range).e.r > LIMITE_LINHAS) throw new Error("Envie até 5.000 produtos por arquivo.");
  for (const [cell, value] of Object.entries(sheet)) if (!cell.startsWith("!") && (value.f || value.t === "e")) throw new Error(`Célula ${cell}: fórmulas ou erros não são aceitos. Cole somente valores.`);
  const tabela = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
  const codeColumn = (tabela[0] || []).findIndex(v => chave(v) === "codigo");
  if (codeColumn >= 0) for (let r = 1; r < tabela.length; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: codeColumn })];
    if (cell?.t === "n") {
      const codigo = cell.w ?? XLSX.utils.format_cell(cell);
      if (!Number.isSafeInteger(cell.v) || !/^\d+$/.test(codigo)) throw new Error(`Linha ${r + 1}: formate o código como Texto, sem notação científica, para preservar os dígitos.`);
      tabela[r][codeColumn] = codigo;
    }
  }
  return validarProdutos(tabela, marcas, produtos, marcaPadrao);
}
