import type { Campanha } from "@/lib/types";
import Link from "next/link";

export default function CampanhaCard({ c, pontos, posicao }: { c: Campanha; pontos?: number; posicao?: number }) {
  return (
    <div className="rounded-2xl border border-jj-yellow/25 bg-jj-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-white">{c.nome}</h3>
          <p className="mt-1 text-sm text-white/60">{c.descricao}</p>
          <p className="mt-2 text-xs text-white/55">
            {c.data_inicio} → {c.data_fim}
          </p>
        </div>
        {c.ativa && (
          <span className="rounded-full bg-jj-yellow px-2 py-1 text-xs font-bold text-black">ATIVA</span>
        )}
      </div>
      {(pontos !== undefined || posicao !== undefined) && (
        <div className="mt-3 flex gap-2">
          {pontos !== undefined && (
            <div className="flex-1 rounded-xl bg-jj-black p-3 text-center">
              <p className="text-2xl font-bold text-jj-yellow">{pontos}</p>
              <p className="text-xs text-white/50">meus pontos</p>
            </div>
          )}
          {posicao !== undefined && (
            <div className="flex-1 rounded-xl bg-jj-black p-3 text-center">
              <p className="text-2xl font-bold text-white">{posicao}º</p>
              <p className="text-xs text-white/50">minha posição</p>
            </div>
          )}
        </div>
      )}
      <Link
        href={`/ranking?campanha=${encodeURIComponent(c.nome)}`}
        className="mt-3 block rounded-xl border border-jj-yellow/40 px-3 py-2 text-center text-sm font-semibold text-jj-yellow"
      >
        Ver ranking
      </Link>
    </div>
  );
}
