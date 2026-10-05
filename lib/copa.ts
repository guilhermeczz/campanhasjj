// Resultado calculado exclusivamente por jj_calcular_ranking no PostgreSQL.
export interface ResultadoVendedorMarca {
  vendedor_id: string;
  vendedor_nome: string;
  marca_id: string;
  marca_nome: string;
  posicao: number;
  faturamento_bruto_marca: number;
  valor_devolucoes_marca: number;
  valor_cancelamentos_marca: number;
  faturamento_liquido_marca: number;
  quantidade_clientes_distintos: number;
  faturamento_geral_periodo: number;
  valor_premio: number | null;
  status_empate: string | null;
  total_pontos: number;
}
export const PREMIOS_PADRAO = [2000, 1500, 500];

