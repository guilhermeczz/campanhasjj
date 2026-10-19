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

export interface Campanha {
  id: string;
  nome: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  ativa: boolean;
  premio_1?: number;
  premio_2?: number;
  premio_3?: number;
}

export interface Categoria {
  id: string;
  nome: string;
  ativa?: boolean;
}

export interface Venda {
  id?: string;
  linha_planilha?: number;
  vendedor: string;
  vendedor_nome?: string;
  categoria: string;
  valor_vendido: number;
  campanha_id: string;
  data_faturamento?: string;
}

export interface RankingValor {
  campanha_id: string;
  categoria_nome: string;
  vendedor_id: string;
  vendedor_nome: string;
  posicao: number;
  total_vendido: number;
  itens: number;
  valor_premio: number | null;
  status_empate: string | null;
}
