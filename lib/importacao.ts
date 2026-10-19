import type { Categoria, VendedorFull } from "./types";
import { CAMPOS_PLANILHA, chaveDoCabecalho } from "./importacaoGuia";

export const LIMITE_LINHAS = 5000;
export const LIMITE_ARQUIVO = 5 * 1024 * 1024;

export interface CadastrosImportacao {
  vendedores: Pick<VendedorFull, "id" | "username" | "nome" | "ativo" | "role">[];
  categorias: Categoria[];
}

export interface LinhaValidada {
  linha: number;
  vendedor: string;
  vendedor_nome: string;
  vendedor_id: string;
  categoria: string;
  valor_vendido: number;
  erro?: string;
}

/** Aceita números do Excel ou notação brasileira/decimal; nunca assume zero para dado inválido. */
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

function textoCelula(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" && Number.isSafeInteger(valor)) return String(valor);
  return "";
}

export function validarLinhas(tabela: unknown[][], cadastros: CadastrosImportacao): LinhaValidada[] {
  if (!tabela.length) throw new Error("A planilha está vazia. Use a aba Vendas do modelo.");
  const cabecalho = tabela[0].map((valor) => chaveDoCabecalho(textoCelula(valor)));
  const faltando = CAMPOS_PLANILHA.filter((campo) => !campo.opcional && !cabecalho.includes(campo.chave));
  if (faltando.length) throw new Error(`Colunas obrigatórias ausentes: ${faltando.map((campo) => campo.titulo).join(", ")}. Baixe o modelo atualizado e mantenha os títulos da primeira linha.`);
  if (CAMPOS_PLANILHA.some((campo) => cabecalho.filter((h) => h === campo.chave).length > 1)) throw new Error("Há colunas repetidas no cabeçalho. Use o modelo sem duplicar colunas.");

  const registros = tabela.slice(1).map((celulas, i) => ({ celulas, linha: i + 2 }))
    .filter(({ celulas }) => celulas.some((valor) => valor !== null && valor !== undefined && String(valor).trim() !== ""));
  if (registros.length > LIMITE_LINHAS) throw new Error(`O limite é ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas por arquivo. Divida a planilha.`);
  if (!registros.length) throw new Error("A aba Vendas ainda não tem dados. Preencha suas vendas a partir da linha 2.");

  const indices = Object.fromEntries(CAMPOS_PLANILHA.map((campo) => [campo.chave, cabecalho.indexOf(campo.chave)])) as Record<typeof CAMPOS_PLANILHA[number]["chave"], number>;

  return registros.map(({ celulas, linha }) => {
    const erros: string[] = [];
    const campo = (nome: typeof CAMPOS_PLANILHA[number]["chave"]) => celulas[indices[nome]];
    const vendedorInformado = textoCelula(campo("vendedor"));
    const categoriaInformada = textoCelula(campo("categoria"));
    const valor = parseNumeroBR(campo("valor_vendido"));

    const vendedor = cadastros.vendedores.find((v) =>
      v.ativo && v.role === "vendedor" && (
        v.username.toLowerCase() === vendedorInformado.toLowerCase() ||
        v.nome.toLowerCase() === vendedorInformado.toLowerCase()
      ));

    const categorias = cadastros.categorias.filter((c) => c.nome.toLowerCase() === categoriaInformada.toLowerCase());
    const categoria = categorias.length === 1 ? categorias[0] : undefined;

    if (!vendedorInformado) erros.push("Vendedor: preencha o nome ou login do vendedor");
    else if (!vendedor) erros.push("Vendedor: não encontrado ou inativo; confira o cadastro em Vendedores");

    if (!categoriaInformada) erros.push("Categoria: preencha o nome da categoria");
    else if (categorias.length > 1) erros.push("Categoria: há categorias com o mesmo nome; corrija em Categorias");
    else if (!categoria) erros.push(`Categoria "${categoriaInformada}": não cadastrada; cadastre-a em Categorias`);

    if (valor === null || valor < 0 || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.00001) {
      erros.push("Valor Vendido: informe um número positivo ou zero, com até 2 casas decimais, como 1000,50");
    }

    return {
      linha,
      vendedor: vendedor?.username || vendedorInformado,
      vendedor_nome: vendedor?.nome || "",
      vendedor_id: vendedor?.id || "",
      categoria: categoria?.nome || categoriaInformada,
      valor_vendido: valor ?? 0,
      erro: erros.length ? erros.join(" · ") : undefined
    };
  });
}
