"use client";

import { useEffect, useState } from "react";
import type { Campanha } from "@/lib/types";
import { useStore } from "@/lib/store";
import EvolutionChart from "./EvolutionChart";

export default function EvolucaoCampanha({ campanha }: { campanha: Campanha }) {
  const { vendedores, carregarEvolucao } = useStore();
  const [vendedor, setVendedor] = useState("");
  const [evolucao, setEvolucao] = useState<{ data: string; valor: number; acumulado: number }[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setEvolucao(null); setErro("");
    carregarEvolucao(campanha.id, vendedor).then((dias) => { if (ativo) setEvolucao(dias); })
      .catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar a evolução."); });
    return () => { ativo = false; };
  }, [campanha.id, vendedor, carregarEvolucao]);

  const selecionado = vendedores.find((v) => v.id === vendedor);

  return <section aria-label="Evolução da campanha" className="space-y-3">
    <div className="card p-4 sm:p-5">
      <div className="max-w-md">
        <label htmlFor="vendedor-evolucao" className="field-label">Ver evolução</label>
        <select id="vendedor-evolucao" className="input" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
          <option value="">Toda a equipe</option>
          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </select>
      </div>
    </div>
    {erro ? <p className="error-message" role="alert">{erro}</p>
      : evolucao ? <EvolutionChart dados={evolucao} titulo={selecionado ? `Evolução de ${selecionado.nome}` : "Evolução da equipe"} />
      : <div className="card p-5" role="status" aria-label="Carregando evolução"><div className="h-24 animate-pulse rounded-xl bg-white/5" /></div>}
  </section>;
}
