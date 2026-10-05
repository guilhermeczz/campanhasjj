export type Role = "admin" | "vendedor";

export interface User {
  id: string;
  username: string;
  nome: string;
  role: Role;
}

export interface VendedorFull extends User {
  /** Somente entrada; nunca retornada pelo backend. */
  senha?: string;
  ativo: boolean;
}

export type TipoCampanha = "pontos" | "faturamento_marca";

export interface Campanha {
  id: string;
  nome: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  ativa: boolean;
  tipo?: TipoCampanha;
  premio_1?: number;
  premio_2?: number;
  premio_3?: number;
  marca_id?: string; // campanha vinculada a 1 marca (cada marca é uma campanha)
  marca_nome?: string;
}

export interface Marca {
  id: string;
  nome: string;
  codigo_externo?: string; // ID/código configurável da marca
  ativa?: boolean;
}

export interface Produto {
  id: string;
  ativo?: boolean;
  marca_id: string;
  marca_nome: string;
  nome: string;
  valor_por_ponto: number | null;
  preco_venda?: number | null;
  pontos_por_real?: number | null;
  codigo_externo?: string;
}

export interface Venda {
  id: string;
  /** Somente no envio de planilha, para localizar a linha na auditoria. */
  linha_planilha?: number;
  item_id?: string;
  vendedor_id?: string;
  produto_id?: string;
  vendedor: string; // username
  vendedor_nome?: string;
  quantidade: number;
  produto: string;
  marca?: string;
  marca_id?: string;
  marca_nome?: string;
  campanha: string; // nome da campanha
  pontos: number;
  valor_por_ponto?: number | null;
  preco_venda?: number | null;
  pontos_por_real?: number | null;
  // Campos da COPA (faturamento)
  data_faturamento?: string; // ISO
  valor_bruto?: number;
  valor_devolucao?: number;
  valor_cancelamento?: number;
  cliente_id?: string;
  cliente_nome?: string;
  status?: string; // faturado | cancelado
}

export interface RankingItem {
  vendedor: string;
  nome: string;
  totalPontos: number;
  totalQtd: number;
  posicao: number;
}
