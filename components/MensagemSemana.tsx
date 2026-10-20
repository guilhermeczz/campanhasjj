"use client";

import { useEffect, useState } from "react";
import { mensagemDaSemana, type MensagemSemana as Mensagem } from "@/lib/mensagens";

export default function MensagemSemana({ onContinuar }: { onContinuar?: () => void }) {
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  useEffect(() => {
    setMensagem(mensagemDaSemana());
  }, []);

  if (!mensagem) return <section className="card min-h-[45vh] p-6 sm:p-10" aria-hidden="true" />;

  return (
    <section className="mensagem-semana card flex min-h-[45vh] flex-col justify-center border-jj-yellow/25 bg-gradient-to-br from-jj-yellow/10 via-transparent to-transparent p-6 sm:p-10" aria-labelledby="mensagem-semana">
      <p className="section-eyebrow">Mensagem da semana</p>
      <h2 id="mensagem-semana" className="mt-3 max-w-3xl text-xl font-semibold leading-relaxed sm:text-2xl">{mensagem.frase1}</h2>
      <p className="mt-2 max-w-3xl text-base leading-relaxed text-white/70">{mensagem.frase2}</p>
      {onContinuar && <button type="button" className="btn-primary mt-8 self-start" onClick={onContinuar}>
        Ver minha posição no ranking
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </button>}
    </section>
  );
}
