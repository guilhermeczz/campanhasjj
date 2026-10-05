import type { Campanha, Marca, Produto, Venda, VendedorFull } from "./types";
import { CAMPOS_PLANILHA, chaveDoCabecalho } from "./importacaoGuia";
import { calcularPontosReferencia, calcularPontosProduto, regraProduto } from "./pontuacao";

export const EXCEL_HEADERS_COPA = [
  "item_id", "vendedor", "produto", "quantidade", "marca_id", "data_faturamento",
  "valor_bruto", "valor_devolucao", "valor_cancelamento", "cliente_id", "status"
] as const;

export const LIMITE_LINHAS = 5000;
export const LIMITE_ARQUIVO = 5 * 1024 * 1024;

export interface CadastrosImportacao {
  vendedores: Pick<VendedorFull, "id" | "username" | "nome" | "ativo" | "role">[];
  marcas: Marca[];
  campanhas: Campanha[];
  produtos: Produto[];
  vendas?: Pick<Venda, "item_id" | "data_faturamento">[];
}

export interface LinhaCopaValidada {
  linha: number;
  item_id: string;
  vendedor: string;
  vendedor_nome: string;
  produto: string;
  produto_id: string;
  valor_por_ponto: number;
  preco_venda: number | null;
  pontos_por_real: number | null;
  pontos: number;
  quantidade: number;
  marca_id: string;
  marca_nome: string;
  data_faturamento: string;
  origem_data: "planilha" | "cadastro" | "importacao";
  valor_bruto: number;
  valor_devolucao: number;
  valor_cancelamento: number;
  cliente_id: string;
  status: "faturado" | "cancelado" | "pendente" | "";
  campanha: string;
  destino: string;
  faturamento_liquido: number;
  erro?: string;
}

/** Accepts Excel numbers or explicit Brazilian/decimal notation; never defaults bad data to zero. */
export function parseNumeroBR(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const texto = valor.trim().replace(/^R\$\s*/, "").trim();
  let normalizado: string;
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(texto)) {
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+(?:[.,]\d+)?$/.test(texto)) {
    normalizado = texto.replace(",", ".");
  } else {
    return null;
  }
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function dataComComponentes(ano: number, mes: number, dia: number, hora = 0, minuto = 0, segundo = 0, ms = 0, offsetMinutos = -180): string | null {
  if (ano < 1900 || ano > 9999 || mes < 1 || mes > 12 || dia < 1 || hora > 23 || minuto > 59 || segundo > 59) return null;
  const instanteLocal = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms);
  const teste = new Date(instanteLocal);
  if (teste.getUTCFullYear() !== ano || teste.getUTCMonth() !== mes - 1 || teste.getUTCDate() !== dia) return null;
  return new Date(instanteLocal - offsetMinutos * 60_000).toISOString();
}

/** Spreadsheet dates without an offset are São Paulo wall time (UTC−03 in the campaign). */
export function parseDataFaturamento(valor: unknown): string | null {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 1 || valor >= 2958466 || Math.floor(valor) === 60) return null;
    // Excel's fictitious 29/02/1900 needs a one-day correction before serial 60.
    const serial = valor < 60 ? valor + 1 : valor;
    const data = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000));
    return dataComComponentes(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate(), data.getUTCHours(), data.getUTCMinutes(), data.getUTCSeconds(), data.getUTCMilliseconds());
  }
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(texto);
  if (br) return dataComComponentes(+br[3], +br[2], +br[1], +(br[4] || 0), +(br[5] || 0), +(br[6] || 0), Number((br[7] || "").padEnd(3, "0")));
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(texto);
  if (!iso) return null;
  let offset = -180;
  if (iso[8] === "Z") offset = 0;
  else if (iso[8]) {
    const horas = Number(iso[8].slice(1, 3));
    const minutos = Number(iso[8].slice(4, 6));
    if (horas > 14 || minutos > 59 || (horas === 14 && minutos !== 0)) return null;
    offset = (iso[8][0] === "-" ? -1 : 1) * (horas * 60 + minutos);
  }
  return dataComComponentes(+iso[1], +iso[2], +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0), Number((iso[7] || "").padEnd(3, "0")), offset);
}

function textoCelula(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" && Number.isSafeInteger(valor)) return String(valor);
  return "";
}

function dentroDoPeriodo(dataISO: string, campanha: Campanha): boolean {
  const inicio = parseDataFaturamento(campanha.data_inicio);
  const fim = parseDataFaturamento(campanha.data_fim);
  if (!inicio || !fim || !dataISO) return false;
  const limite = Date.parse(fim) + (/^\d{4}-\d{2}-\d{2}$/.test(campanha.data_fim) ? 86_400_000 : 1);
  return Date.parse(dataISO) >= Date.parse(inicio) && Date.parse(dataISO) < limite;
}

/** Round the preview like PostgreSQL NUMERIC, without binary rounding at x.xx5. */
export function calcularPontosPorValor(liquido: number, valorPorPonto: number): number {
  return calcularPontosReferencia(liquido, valorPorPonto, 1);
}

export function validarLinhasCopa(tabela: unknown[][], cadastros: CadastrosImportacao, dataImportacao = new Date().toISOString()): LinhaCopaValidada[] {
  if (!tabela.length) throw new Error("A planilha está vazia. Use a aba Vendas do modelo.");
  const cabecalho = tabela[0].map((valor) => chaveDoCabecalho(textoCelula(valor)));
  const faltando = CAMPOS_PLANILHA.filter((campo) => !campo.opcional && !cabecalho.includes(campo.chave));
  if (faltando.length) throw new Error(`Colunas obrigatórias ausentes: ${faltando.map((campo) => campo.titulo).join(", ")}. Baixe o modelo atualizado e mantenha os títulos da primeira linha.`);
  if (EXCEL_HEADERS_COPA.some((campo) => cabecalho.filter((h) => h === campo).length > 1)) throw new Error("Há colunas repetidas no cabeçalho. Use o modelo sem duplicar colunas.");
  const registros = tabela.slice(1).map((celulas, i) => ({ celulas, linha: i + 2 })).filter(({ celulas }) => celulas.some((valor) => valor !== null && valor !== undefined && String(valor).trim() !== ""));
  if (registros.length > LIMITE_LINHAS) throw new Error(`O limite é ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas por arquivo. Divida a planilha.`);
  if (!registros.length) throw new Error("A aba Vendas ainda não tem dados. Preencha suas vendas a partir da linha 2.");
  const indices = Object.fromEntries(EXCEL_HEADERS_COPA.map((campo) => [campo, cabecalho.indexOf(campo)])) as Record<typeof EXCEL_HEADERS_COPA[number], number>;
  const campanhas = cadastros.campanhas.filter((campanha) => campanha.ativa && campanha.tipo === "faturamento_marca");
  const repetidos = new Map<string, number[]>();
  const datasExistentes = new Map((cadastros.vendas || []).filter(v => v.item_id && v.data_faturamento).map(v => [v.item_id, v.data_faturamento!]));
  for (const { celulas, linha } of registros) {
    const id = textoCelula(celulas[indices.item_id]);
    if (id) repetidos.set(id, [...(repetidos.get(id) || []), linha]);
  }
  return registros.map(({ celulas, linha }) => {
    const erros: string[] = [];
    const campo = (nome: typeof EXCEL_HEADERS_COPA[number]) => celulas[indices[nome]];
    const item_id = textoCelula(campo("item_id"));
    const vendedorInformado = textoCelula(campo("vendedor"));
    const vendedor = cadastros.vendedores.find((v) => v.username.toLowerCase() === vendedorInformado.toLowerCase() && v.ativo && v.role === "vendedor");
    const produto = textoCelula(campo("produto"));
    const cliente_id = textoCelula(campo("cliente_id"));
    const codigoMarca = textoCelula(campo("marca_id"));
    const marcas = cadastros.marcas.filter((m) => m.id === codigoMarca || (Boolean(m.codigo_externo) && m.codigo_externo === codigoMarca));
    const marca = marcas.length === 1 ? marcas[0] : undefined;
    const produtos = cadastros.produtos.filter((p) => p.marca_id === marca?.id && [p.nome, p.codigo_externo].some((v) => v?.trim().toLowerCase() === produto.toLowerCase()));
    const produtoCadastrado = produtos.length === 1 ? produtos[0] : undefined;
    const regra = regraProduto(produtoCadastrado);
    const quantidade = parseNumeroBR(campo("quantidade"));
    const dataInformada = campo("data_faturamento");
    const dataVazia = dataInformada == null || (typeof dataInformada === "string" && !dataInformada.trim());
    const existente = datasExistentes.get(item_id);
    const dataAnterior = existente && Number.isFinite(Date.parse(existente)) ? new Date(existente).toISOString() : null;
    const origem_data = !dataVazia ? "planilha" : dataAnterior ? "cadastro" : "importacao";
    // Resolve once in the preview; the same timestamp is sent to the existing backend.
    const data_faturamento = dataVazia ? dataAnterior || parseDataFaturamento(dataImportacao) : parseDataFaturamento(dataInformada);
    const statusInformado = textoCelula(campo("status")).toLowerCase() || "faturado";
    const status: LinhaCopaValidada["status"] = ["faturado", "cancelado", "pendente"].includes(statusInformado) ? statusInformado as LinhaCopaValidada["status"] : "";
    if (!item_id) erros.push("Código do item: preencha um código único, como NF-123-ITEM-1");
    else if ((repetidos.get(item_id)?.length || 0) > 1) erros.push(`Código do item repetido nas linhas ${repetidos.get(item_id)!.join(", ")}: mantenha apenas uma linha por item`);
    if (!vendedor) erros.push("Vendedor: não encontrado ou inativo; consulte o login na ajuda desta página");
    if (!produto) erros.push("Produto: preencha o nome do produto vendido");
    else if (marca && !produtoCadastrado) erros.push(produtos.length > 1 ? "Produto: identificação ambígua nesta marca; corrija o cadastro em Produtos" : "Produto: não cadastrado nesta marca; cadastre em Produtos ou consulte o código ou nome na ajuda");
    else if (produtoCadastrado?.ativo === false) erros.push("Produto: cadastro inativo; ative o produto antes de importar");
    else if (produtoCadastrado && (regra.preco <= 0 || regra.pontos <= 0)) erros.push("Pontos: configure a regra no cadastro do produto");
    if (!cliente_id) erros.push("Código do cliente: preencha o código; use o mesmo em todas as compras desse cliente");
    if (!marca) erros.push(marcas.length > 1 ? "Código da marca: há cadastros com o mesmo código; corrija em Marcas" : "Código da marca: não encontrado; consulte o código na ajuda desta página");
    if (quantidade === null || quantidade <= 0) erros.push("Quantidade: informe um número maior que zero, como 10");
    if (!data_faturamento) erros.push("Data do faturamento: use uma data válida, como 01/10/2026 09:30:00");
    if (!status) erros.push("Situação: use faturado, cancelado ou pendente; em branco significa faturado");
    const monetario = (nome: "valor_bruto" | "valor_devolucao" | "valor_cancelamento") => {
      const entrada = campo(nome);
      const vazio = entrada == null || (typeof entrada === "string" && !entrada.trim());
      const valor = nome !== "valor_bruto" && vazio ? 0 : parseNumeroBR(entrada);
      if (valor === null || valor < 0 || !Number.isSafeInteger(Math.round(valor * 100)) || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.00001) {
        erros.push(`${CAMPOS_PLANILHA.find((campo) => campo.chave === nome)!.titulo}: informe um valor positivo ou zero, com até 2 casas decimais, como 1000,50`);
        return 0;
      }
      return valor;
    };
    const valor_bruto = monetario("valor_bruto");
    const valor_devolucao = monetario("valor_devolucao");
    const valor_cancelamento = monetario("valor_cancelamento");
    if (Math.round(valor_devolucao * 100) + Math.round(valor_cancelamento * 100) > Math.round(valor_bruto * 100)) erros.push("devolução + cancelamento não podem superar o valor bruto");
    const doPeriodo = campanhas.filter((campanha) => dentroDoPeriodo(data_faturamento || "", campanha));
    const destinos = doPeriodo.filter((campanha) => campanha.marca_id === marca?.id && marca?.ativa !== false);
    if (destinos.length > 1) erros.push("mais de uma campanha ativa para esta marca e período; revise o cadastro");
    const campanha = destinos[0]?.nome || "";
    const destino = campanha || (doPeriodo.length ? "Somente desempate" : "Fora do período");
    // Preview only: the authoritative ranking and import validation run in PostgreSQL.
    const faturamento_liquido = status === "faturado" ? (Math.round(valor_bruto * 100) - Math.round(valor_devolucao * 100) - Math.round(valor_cancelamento * 100)) / 100 : 0;
    return {
      linha, item_id, vendedor: vendedor?.username || vendedorInformado, vendedor_nome: vendedor?.nome || "",
      produto, quantidade: quantidade ?? 0, marca_id: marca?.id || codigoMarca, marca_nome: marca?.nome || codigoMarca,
      produto_id: produtoCadastrado?.id || "", valor_por_ponto: produtoCadastrado?.valor_por_ponto || 0,
      preco_venda: produtoCadastrado?.preco_venda ?? null, pontos_por_real: produtoCadastrado?.pontos_por_real ?? null,
      pontos: status === "faturado" ? calcularPontosProduto(faturamento_liquido, produtoCadastrado) : 0,
      data_faturamento: data_faturamento || "", origem_data, valor_bruto, valor_devolucao, valor_cancelamento,
      cliente_id, status, campanha, destino, faturamento_liquido, erro: erros.length ? erros.join(" · ") : undefined
    };
  });
}
