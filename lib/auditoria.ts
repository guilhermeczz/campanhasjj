export interface ImportacaoAuditada {
  id: string; criado_em: string; autor_nome: string; autor_usuario: string; arquivo: string;
  total: number; inseridas: number; atualizadas: number; valor_liquido: number; total_pontos: number;
  desfeita_em: string | null; desfeita_por_nome: string | null; desfeita_por_usuario: string | null; pode_desfazer: boolean;
}
export interface HistoricoImportacoes {
  registros: ImportacaoAuditada[]; pagina: number; paginas: number; total: number;
  previas_unicas: number; bytes_previas: number; bytes_restauracao: number;
}
export interface PreviaImportacao {
  importacao: ImportacaoAuditada; colunas: string[];
  linhas: (string | number | null)[][]; pagina: number; paginas: number;
}
