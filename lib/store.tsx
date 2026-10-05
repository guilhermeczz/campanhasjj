"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Campanha, Venda, Marca, Produto, VendedorFull } from "./types";
import type { ResultadoVendedorMarca } from "./copa";
import { useAuth } from "./auth";
import { api } from "./http";
import type { ProdutoImportado } from "./produtosExcel";

type ProdutoParaImportar = Pick<ProdutoImportado, "nome" | "marca_id" | "codigo_externo" | "valor_por_ponto" | "preco_venda" | "pontos_por_real">;

export type RankingCampanha = ResultadoVendedorMarca & { campanha_id: string };
export interface PontuacaoCampanha { campanha_id: string; vendedor_id: string; total_pontos: number }
interface Dados {
  campanhas: Campanha[]; vendas: Venda[]; marcas: Marca[]; produtos: Produto[];
  vendedores: VendedorFull[]; rankings: RankingCampanha[];
  pontuacoes: PontuacaoCampanha[];
}
export interface ResultadoImportacao { inseridas: number; atualizadas: number; total: number; auditoria_id?: string }
interface Store extends Dados {
  loading: boolean; error: string | null;
  campanhaSelecionada: string;
  setCampanhaSelecionada: (id: string) => void;
  recarregar: () => Promise<void>;
  salvarCampanha: (item: Campanha) => Promise<void>;
  salvarVendedor: (item: VendedorFull) => Promise<void>;
  salvarMarca: (item: Marca) => Promise<void>;
  salvarProduto: (item: Produto) => Promise<void>;
  excluirVendedor: (id: string) => Promise<void>;
  excluirProduto: (id: string) => Promise<void>;
  importarProdutos: (linhas: ProdutoParaImportar[]) => Promise<ResultadoImportacao>;
  adicionarVendas: (linhas: Venda[], arquivo?: string) => Promise<ResultadoImportacao>;
}
const EMPTY: Dados = { campanhas: [], vendas: [], marcas: [], produtos: [], vendedores: [], rankings: [], pontuacoes: [] };
const Ctx = createContext<Store>({} as Store);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [dados, setDados] = useState<Dados>(EMPTY);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const recarregar = useCallback(async () => {
    const id = ++requestId.current;
    if (!user) { setDados(EMPTY); setError(null); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const result = await api<Dados>("/api/data");
      if (id === requestId.current) setDados(result);
    } catch (err) {
      if (id === requestId.current) {
        setDados(EMPTY);
        setError(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
      }
    } finally { if (id === requestId.current) setLoading(false); }
  }, [user]);
  useEffect(() => { void recarregar(); return () => { requestId.current++; }; }, [recarregar]);

  async function salvar(entidade: string, item: Campanha | Marca | Produto | VendedorFull) {
    await api("/api/cadastros", { method: "POST", body: JSON.stringify({ entidade, item }) });
    await recarregar();
  }
  async function adicionarVendas(linhas: Venda[], arquivo?: string) {
    const result = await api<ResultadoImportacao>("/api/importar", {
      method: "POST", body: JSON.stringify({ linhas, arquivo })
    });
    await recarregar();
    return result;
  }
  async function excluirVendedor(id: string) {
    await api("/api/vendedores", { method: "DELETE", body: JSON.stringify({ id }) });
    await recarregar();
  }
  async function importarProdutos(linhas: ProdutoParaImportar[]) {
    const result = await api<ResultadoImportacao>("/api/produtos/importar", { method: "POST", body: JSON.stringify({ linhas }) });
    await recarregar();
    return result;
  }
  async function excluirProduto(id: string) {
    await api("/api/produtos", { method: "DELETE", body: JSON.stringify({ id, confirmar: true }) });
    await recarregar();
  }
  return <Ctx.Provider value={{ ...dados, loading, error, recarregar, campanhaSelecionada, setCampanhaSelecionada,
    salvarCampanha: item => salvar("campanhas", item),
    salvarVendedor: item => salvar("vendedores", item),
    salvarMarca: item => salvar("marcas", item),
    salvarProduto: item => salvar("produtos", item), adicionarVendas, excluirVendedor, excluirProduto, importarProdutos
  }}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx);
export const uid = (prefixo = "local") => prefixo + "-" + crypto.randomUUID();

