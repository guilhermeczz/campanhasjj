"use client";

import { useEffect, useRef } from "react";
import type { ImportacaoAuditada } from "@/lib/auditoria";

export default function ConfirmUndoImport({ registro, busy, error, onCancel, onConfirm }: {
  registro: ImportacaoAuditada | null; busy: boolean; error: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (registro && !dialog.current?.open) dialog.current?.showModal();
    if (!registro && dialog.current?.open) dialog.current?.close();
  }, [registro]);
  return <dialog ref={dialog} className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-xl border border-white/15 bg-[#171717] p-6 text-white shadow-2xl backdrop:bg-black/75" aria-labelledby="desfazer-titulo" aria-describedby="desfazer-descricao" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="desfazer-titulo" className="text-xl font-semibold">Desfazer esta importação?</h2>
    <div id="desfazer-descricao" className="mt-3 space-y-3 text-sm leading-6 text-white/70">
      <p className="break-all font-medium text-white">{registro?.arquivo}</p>
      <p>Serão removidas <strong className="text-white">{registro?.inseridas} vendas novas</strong> e restauradas <strong className="text-white">{registro?.atualizadas} vendas atualizadas</strong> para os valores anteriores. Os pontos e o ranking serão atualizados.</p>
      <p>O histórico e a prévia serão preservados. Para aplicar essas vendas novamente, será necessário importar a planilha outra vez.</p>
    </div>
    {error && <p role="alert" className="error-message mt-4">{error}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-3"><button autoFocus type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>Manter importação</button><button type="button" className="btn-danger" disabled={busy} onClick={onConfirm}>{busy ? "Desfazendo…" : "Confirmar e desfazer"}</button></div>
  </dialog>;
}
