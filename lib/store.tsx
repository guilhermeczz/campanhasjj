"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Campanha, Categoria, RankingValor, VendedorFull, Venda } from "./types";
import { useAuth } from "./auth";
import { api } from "./http";

export interface ResumoVendedor {
  id: string; nome: string; username: string; ativo: boolean; excluido: boolean;
  total_vendido: number; itens: number; ultima_venda: string;
}
export interface EvolucaoDia { data: string; valor: number; acumulado: number }

interface Dados {
  campanhas: Campanha[]; categorias: Categoria[]; vendedores: VendedorFull[];
  rankings: RankingValor[]; vendas_total: number;
}
export interface ResultadoImportacao { inseridas: number; atualizadas: number; total: number; auditoria_id?: string }

interface Store extends Dados {
  loading: boolean; atualizando: boolean; pronto: boolean; error: string | null;
  campanhaSelecionada: string;
  setCampanhaSelecionada: (id: string) => void;
  recarregar: () => Promise<void>;
  carregarResumo: (campanhaId: string) => Promise<ResumoVendedor[]>;
  carregarEvolucao: (campanhaId: string, vendedorId?: string) => Promise<EvolucaoDia[]>;
  salvarCampanha: (item: Campanha) => Promise<void>;
  salvarCategoria: (item: Categoria) => Promise<void>;
  salvarVendedor: (item: VendedorFull) => Promise<void>;
  excluirCategoria: (id: string) => Promise<void>;
  excluirVendedor: (id: string) => Promise<void>;
  excluirCampanha: (id: string) => Promise<void>;
  adicionarVendas: (linhas: Venda[], campanhaId: string, arquivo: string) => Promise<ResultadoImportacao>;
}
const EMPTY: Dados = { campanhas: [], categorias: [], vendedores: [], rankings: [], vendas_total: 0 };
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
        setDados({ campanhas: result.campanhas ?? [], categorias: result.categorias ?? [], vendedores: result.vendedores ?? [], rankings: result.rankings ?? [], vendas_total: result.vendas_total ?? 0 });
        resumos.current.clear(); evolucoes.current.clear();
        teveDados.current = true;
        setPronto(true);
      }
    } catch (err) {
      if (id === requestId.current && !silencioso) setDados(EMPTY);
      if (id === requestId.current) setError(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
    } finally { if (id === requestId.current) { setLoading(false); setAtualizando(false); } }
  }, [user]);

  const carregarResumo = useCallback(async (campanhaId: string) => {
    const salvo = resumos.current.get(campanhaId);
    if (salvo) return salvo;
    const chave = `resumo:${campanhaId}`;
    const voo = pendentes.current.get(chave) as Promise<ResumoVendedor[]> | undefined;
    if (voo) return voo;
    const pedido = api<ResumoVendedor[]>(`/api/resumo?campanha=${encodeURIComponent(campanhaId)}`).then((linhas) => {
      resumos.current.set(campanhaId, linhas); pendentes.current.delete(chave); return linhas;
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
      evolucoes.current.set(chave, dias); pendentes.current.delete(`evolucao:${chave}`); return dias;
    }).catch((erro) => { pendentes.current.delete(`evolucao:${chave}`); throw erro; });
    pendentes.current.set(`evolucao:${chave}`, pedido);
    return pedido;
  }, []);

  useEffect(() => { void recarregar(); return () => { requestId.current++; }; }, [recarregar]);

  useEffect(() => {
    setCampanhaSelecionada((atual) => {
      if (!dados.campanhas.length) return "";
      if (atual && dados.campanhas.some((c) => c.id === atual)) return atual;
      return (dados.campanhas.find((c) => c.ativa) ?? dados.campanhas[0]).id;
    });
  }, [dados.campanhas]);

  async function salvar(entidade: string, item: Campanha | Categoria | VendedorFull) {
    await api("/api/cadastros", { method: "POST", body: JSON.stringify({ entidade, item }) });
    await recarregar();
  }
  async function adicionarVendas(linhas: Venda[], campanhaId: string, arquivo: string) {
    const result = await api<ResultadoImportacao>("/api/importar", {
      method: "POST", body: JSON.stringify({ linhas, campanha_id: campanhaId, arquivo })
    });
    await recarregar();
    setCampanhaSelecionada(campanhaId);
    return result;
  }
  async function excluirVendedor(id: string) {
    await api("/api/vendedores", { method: "DELETE", body: JSON.stringify({ id }) });
    await recarregar();
  }
  async function excluirCategoria(id: string) {
    await api("/api/categorias", { method: "DELETE", body: JSON.stringify({ id }) });
    await recarregar();
  }
  async function excluirCampanha(id: string) {
    await api("/api/campanhas", { method: "DELETE", body: JSON.stringify({ id, confirmar: true }) });
    await recarregar();
  }
  return <Ctx.Provider value={{ ...dados, loading, atualizando, pronto, error, recarregar, campanhaSelecionada, setCampanhaSelecionada, carregarResumo, carregarEvolucao,
    salvarCampanha: item => salvar("campanhas", item),
    salvarCategoria: item => salvar("categorias", item),
    salvarVendedor: item => salvar("vendedores", item),
    adicionarVendas, excluirVendedor, excluirCategoria, excluirCampanha
  }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
export const uid = (prefixo = "local") => prefixo + "-" + crypto.randomUUID();
