import * as XLSX from "xlsx";
import { CAMPOS_PLANILHA, MODELO_VENDAS, chaveDoCabecalho } from "./importacaoGuia";
import { LIMITE_ARQUIVO, LIMITE_LINHAS, validarLinhas, type CadastrosImportacao, type LinhaValidada } from "./importacao";

export type { LinhaValidada, CadastrosImportacao } from "./importacao";

export async function lerPlanilha(file: File, cadastros: CadastrosImportacao): Promise<LinhaValidada[]> {
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
  const header = linhas[0]?.map((valor) => chaveDoCabecalho(String(valor))) || [];
  for (let r = 1; r < linhas.length; r++) {
    for (let c = 0; c < header.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const titulo = CAMPOS_PLANILHA.find((campo) => campo.chave === header[c])?.titulo || header[c];
      if (cell?.f || cell?.t === "e") throw new Error(`Linha ${r + 1}, ${titulo}: fórmulas e erros de Excel não são aceitos. Copie a célula e use Colar especial → Valores no Excel.`);
    }
  }
  return validarLinhas(linhas, cadastros);
}

export function criarModelo(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const campos = MODELO_VENDAS.map((chave) => CAMPOS_PLANILHA.find((campo) => campo.chave === chave)!);
  const vendas = XLSX.utils.aoa_to_sheet([campos.map((campo) => campo.titulo)]);
  vendas["!cols"] = campos.map((campo) => ({ wch: campo.chave === "categoria" ? 28 : 22 }));
  XLSX.utils.book_append_sheet(wb, vendas, "Vendas");
  return wb;
}

export function gerarModelo(): void {
  XLSX.writeFile(criarModelo(), "modelo-campanhas-jj.xlsx");
}
