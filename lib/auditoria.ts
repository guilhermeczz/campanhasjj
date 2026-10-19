export interface ImportacaoAuditada {
  id: string; criado_em: string; autor_nome: string; autor_username: string; arquivo: string;
  total: number; inseridas: number; valor_total: number;
  desfeita_em: string | null; desfeita_por_nome: string | null; pode_desfazer: boolean;
}

export interface HistoricoImportacoes {
  registros: ImportacaoAuditada[]; pagina: number; paginas: number; total: number;
}

export interface LinhaPrevia {
  linha: number; vendedor: string; vendedor_nome: string; categoria: string;
  valor_vendido: number; data_faturamento: string;
}

export interface PreviaImportacao {
  importacao: Omit<ImportacaoAuditada, "pode_desfazer" | "desfeita_por_nome">;
  linhas: LinhaPrevia[];
  pagina: number; paginas: number;
}
