"use client";

import { useEffect, useRef } from "react";

export default function ConfirmDelete({ nome, busy, error, onCancel, onConfirm, tipo = "vendedor" }: {
  nome: string | null; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void; tipo?: "vendedor" | "produto";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (nome && !dialog.current?.open) dialog.current?.showModal();
    if (!nome && dialog.current?.open) dialog.current?.close();
  }, [nome]);
  return <dialog ref={dialog} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-xl border border-white/15 bg-[#171717] p-6 text-white shadow-2xl backdrop:bg-black/75" aria-labelledby="excluir-titulo" aria-describedby="excluir-descricao" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="excluir-titulo" className="text-xl font-semibold">Excluir {tipo}?</h2>
    <p id="excluir-descricao" className="mt-3 text-sm leading-6 text-white/70"><strong className="text-white">{nome}</strong>{tipo === "produto" ? " será removido do catálogo e não poderá ser usado em novas importações. As vendas, os pontos e o histórico já registrados serão preservados. Se precisar dele novamente, cadastre ou importe um novo produto." : " perderá o acesso e será removido da lista de usuários. As vendas já registradas serão preservadas. Esta ação não pode ser desfeita pela tela."}</p>
    {error && <p className="error-message mt-4" role="alert">{error}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" autoFocus className="btn-ghost" disabled={busy} onClick={onCancel}>Cancelar</button><button type="button" className="btn-danger" disabled={busy} onClick={onConfirm}>{busy ? "Excluindo…" : `Excluir ${tipo}`}</button></div>
  </dialog>;
}
