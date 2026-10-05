import type { RankingItem } from "@/lib/types";

export default function RankingTable({
  items,
  highlight,
  compact = false
}: {
  items: RankingItem[];
  highlight?: string;
  compact?: boolean;
}) {
  if (items.length === 0)
    return <p className="rounded-xl bg-jj-card p-4 text-sm text-white/60">Nenhuma venda lançada ainda.</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-jj-yellow text-black">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Vendedor</th>
            {!compact && <th className="hidden px-3 py-2 sm:table-cell">Qtd</th>}
            <th className="px-3 py-2 text-right">Pontos</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const isMe = highlight && r.vendedor === highlight;
            return (
              <tr
                key={r.vendedor}
                className={isMe ? "bg-jj-yellow/15 font-bold text-jj-yellow" : "bg-jj-card text-white odd:bg-jj-dark"}
              >
                <td className="px-3 py-2">
                  {r.posicao}º
                </td>
                <td className="px-3 py-2">
                  {r.nome}
                  {isMe && <span className="ml-2 rounded bg-jj-yellow px-1.5 text-xs text-black">você</span>}
                </td>
                {!compact && <td className="hidden px-3 py-2 sm:table-cell">{r.totalQtd}</td>}
                <td className="px-3 py-2 text-right font-bold">{r.totalPontos}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
