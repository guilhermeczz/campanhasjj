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
export interface ResumoVendedor {
  id: string; nome: string; username: string; ativo: boolean; excluido: boolean;
  pontos: number; liquido: number; itens: number; ultimaVenda: string;
}
export interface EvolucaoDia { data: string; pontos: number; acumulado: number }
interface Dados {
  campanhas: Campanha[]; vendas: Venda[]; vendas_total: number; marcas: Marca[]; produtos: Produto[];
  vendedores: VendedorFull[]; rankings: RankingCampanha[];
  pontuacoes: PontuacaoCampanha[];
}
export interface ResultadoImportacao { inseridas: number; atualizadas: number; total: number; auditoria_id?: string }
interface Store extends Dados {
  loading: boolean; atualizando: boolean; pronto: boolean; error: string | null;
  campanhaSelecionada: string;
  setCampanhaSelecionada: (id: string) => void;
  recarregar: () => Promise<void>;
  carregarResumo: (campanhaId: string) => Promise<ResumoVendedor[]>;
  carregarEvolucao: (campanhaId: string, vendedorId?: string) => Promise<EvolucaoDia[]>;
  buscarDatasItens: (ids: string[]) => Promise<Record<string, string>>;
  salvarCampanha: (item: Campanha) => Promise<void>;
  salvarVendedor: (item: VendedorFull) => Promise<void>;
  salvarMarca: (item: Marca) => Promise<void>;
  salvarProduto: (item: Produto) => Promise<void>;
  excluirVendedor: (id: string) => Promise<void>;
  excluirProduto: (id: string) => Promise<void>;
  excluirCampanha: (id: string) => Promise<void>;
  importarProdutos: (linhas: ProdutoParaImportar[]) => Promise<ResultadoImportacao>;
  adicionarVendas: (linhas: Venda[], arquivo?: string) => Promise<ResultadoImportacao>;
}
const EMPTY: Dados = { campanhas: [], vendas: [], vendas_total: 0, marcas: [], produtos: [], vendedores: [], rankings: [], pontuacoes: [] };
const Ctx = createContext<Store>({} as Store);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [dados, setDados] = useState<Dados>(EMPTY);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState("");
  const [loading, setLoading] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const teveDados = useRef(false);
  const resumos = useRef(new Map<string, ResumoVendedor[]>());
  const evolucoes = useRef(new Map<string, EvolucaoDia[]>());
  const pendentes = useRef(new Map<string, Promise<ResumoVendedor[] | EvolucaoDia[]>>());
  const recarregar = useCallback(async () => {
    const id = ++requestId.current;
    if (!user) { setDados(EMPTY); setError(null); setLoading(false); setAtualizando(false); setPronto(false); teveDados.current = false; resumos.current.clear(); evolucoes.current.clear(); return; }
    const silencioso = teveDados.current;
    if (silencioso) setAtualizando(true); else setLoading(true);
    setError(null);
    try {
      const result = await api<Dados>("/api/data");
      if (id === requestId.current) {
        setDados({ ...result, vendas: [], vendas_total: result.vendas_total ?? 0 });
        resumos.current.clear(); evolucoes.current.clear();
        teveDados.current = true;
        setPronto(true);
      }
    } catch (err) {
      if (id === requestId.current && !silencioso) {
        setDados(EMPTY);
        setError(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
      }
      if (id === requestId.current && silencioso) setError(err instanceof Error ? err.message : "Não foi possível atualizar os dados.");
    } finally { if (id === requestId.current) { setLoading(false); setAtualizando(false); } }
  }, [user]);
  // Resumo e evolução são buscados sob demanda por campanha e guardados em cache.
  // O cache é invalidado a cada recarregar (importações e cadastros chamam recarregar).
  const carregarResumo = useCallback(async (campanhaId: string) => {
    const salvo = resumos.current.get(campanhaId);
    if (salvo) return salvo;
    const chave = `resumo:${campanhaId}`;
    const voo = pendentes.current.get(chave) as Promise<ResumoVendedor[]> | undefined;
    if (voo) return voo;
    const pedido = api<ResumoVendedor[]>(`/api/resumo?campanha=${encodeURIComponent(campanhaId)}`).then((linhas) => {
      resumos.current.set(campanhaId, linhas);
      pendentes.current.delete(chave);
      return linhas;
    }).catch((erro) => { pendentes.current.delete(chave); throw erro; });
    pendentes.current.set(chave, pedido);
    return pedido;
  }, []);
  const carregarEvolucao = useCallback(async (campanhaId: string, vendedorId = "") => {
    const chave = `${campanhaId}|${vendedorId}`;
    const salvo = evolucoes.current.get(chave);
    if (salvo) return salvo;
    const voo = pendentes.current.get(`evolucao:${chave}`) as Promise<EvolucaoDia[]> | undefined;
    if (voo) return voo;
    const rota = `/api/evolucao?campanha=${encodeURIComponent(campanhaId)}${vendedorId ? `&vendedor=${encodeURIComponent(vendedorId)}` : ""}`;
    const pedido = api<EvolucaoDia[]>(rota).then((dias) => {
      evolucoes.current.set(chave, dias);
      pendentes.current.delete(`evolucao:${chave}`);
      return dias;
    }).catch((erro) => { pendentes.current.delete(`evolucao:${chave}`); throw erro; });
    pendentes.current.set(`evolucao:${chave}`, pedido);
    return pedido;
  }, []);
  // Datas de itens já cadastrados, só para a prévia de reimportação do arquivo aberto.
  const buscarDatasItens = useCallback(async (ids: string[]) => {
    if (!ids.length) return {};
    const linhas = await api<{ item_id: string; data_faturamento: string }[]>("/api/datas-itens", {
      method: "POST", body: JSON.stringify({ ids })
    });
    return Object.fromEntries(linhas.filter((l) => l.item_id && l.data_faturamento).map((l) => [l.item_id, l.data_faturamento]));
  }, []);
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
  async function excluirCampanha(id: string) {
    await api("/api/campanhas", { method: "DELETE", body: JSON.stringify({ id, confirmar: true }) });
    await recarregar();
  }
  return <Ctx.Provider value={{ ...dados, loading, atualizando, pronto, error, recarregar, campanhaSelecionada, setCampanhaSelecionada, carregarResumo, carregarEvolucao, buscarDatasItens,
    salvarCampanha: item => salvar("campanhas", item),
    salvarVendedor: item => salvar("vendedores", item),
    salvarMarca: item => salvar("marcas", item),
    salvarProduto: item => salvar("produtos", item), adicionarVendas, excluirVendedor, excluirProduto, excluirCampanha, importarProdutos
  }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
export const uid = (prefixo = "local") => prefixo + "-" + crypto.randomUUID();

