import * as XLSX from "xlsx";
import { CAMPOS_PLANILHA, MODELO_VENDAS, chaveDoCabecalho } from "./importacaoGuia";
import {
  LIMITE_ARQUIVO, LIMITE_LINHAS, validarLinhasCopa,
  type CadastrosImportacao, type LinhaCopaValidada
} from "./importacao";

export { EXCEL_HEADERS_COPA, type LinhaCopaValidada, type CadastrosImportacao } from "./importacao";

export async function lerPlanilhaCopa(file: File, cadastros: CadastrosImportacao): Promise<LinhaCopaValidada[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Escolha um arquivo Excel .xlsx. Use o modelo desta página.");
  if (file.size > LIMITE_ARQUIVO) throw new Error("O arquivo ultrapassa 5 MB. Divida a planilha e envie novamente.");
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, cellText: true, sheetRows: LIMITE_LINHAS + 3 }); }
  catch { throw new Error("Não foi possível abrir a planilha. Abra o arquivo no Excel, salve uma cópia como .xlsx sem senha e selecione essa cópia."); }
  const nomeAba = wb.SheetNames.find((nome) => nome.toLowerCase() === "vendas");
  if (!nomeAba) throw new Error("Não encontrei a aba Vendas. Use o modelo e mantenha esse nome de aba.");
  const ws = wb.Sheets[nomeAba];
  const range = ws["!fullref"] || ws["!ref"];
  if (range && XLSX.utils.decode_range(range).e.r > LIMITE_LINHAS) throw new Error(`O limite é ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas por arquivo. Divida a planilha.`);
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true, blankrows: true });
  const ids = new Set(["item_id", "vendedor", "marca_id", "cliente_id", "produto"]);
  const header = linhas[0]?.map((valor) => chaveDoCabecalho(String(valor))) || [];
  // Preserve identifiers such as 000123 while leaving numeric/date cells raw.
  for (let r = 1; r < linhas.length; r++) {
    for (let c = 0; c < header.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const titulo = CAMPOS_PLANILHA.find((campo) => campo.chave === header[c])?.titulo || header[c];
      if (cell?.f || cell?.t === "e") throw new Error(`Linha ${r + 1}, ${titulo}: fórmulas e erros de Excel não são aceitos. Copie a célula e use Colar especial → Valores no Excel.`);
      if (ids.has(header[c]) && cell?.t === "n") {
        if (!Number.isSafeInteger(cell.v)) throw new Error(`Linha ${r + 1}, ${titulo}: código numérico inválido. Formate códigos como Texto para preservar todos os dígitos.`);
        const texto = cell.w || XLSX.utils.format_cell(cell);
        if (!/^\d+$/.test(texto)) throw new Error(`Linha ${r + 1}, ${titulo}: formate o código como Texto, sem notação científica ou pontuação numérica.`);
        linhas[r][c] = texto;
      }
    }
  }
  return validarLinhasCopa(linhas, cadastros);
}

export function criarModeloCopa(_cadastros?: CadastrosImportacao): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const campos = MODELO_VENDAS.map((chave) => CAMPOS_PLANILHA.find((campo) => campo.chave === chave)!);
  const vendas = XLSX.utils.aoa_to_sheet([campos.map((campo) => campo.titulo)]);
  vendas["!cols"] = campos.map((campo) => ({ wch: campo.chave === "produto" ? 30 : 25 }));
  XLSX.utils.book_append_sheet(wb, vendas, "Vendas");
  return wb;
}

export function gerarModeloCopa(cadastros: CadastrosImportacao): void {
  XLSX.writeFile(criarModeloCopa(cadastros), "modelo-campanhas-jj.xlsx");
}
