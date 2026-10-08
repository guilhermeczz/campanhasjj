"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import Sidebar from "./Sidebar";

export default function AppShell({ role, title, subtitle, children }: {
  role: "admin" | "vendedor"; title: string; subtitle?: string; children: ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { loading, error, recarregar } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
    else if (user.role !== role) router.replace(user.role === "admin" ? "/admin" : "/painel");
  }, [user, authLoading, role, router]);
  if (authLoading || !user || user.role !== role) return <div className="flex min-h-screen items-center justify-center" role="status"><p className="text-sm text-white/60">Preparando seu acesso…</p></div>;
  return <div className="min-h-screen bg-jj-black">
    <a href="#conteudo" className="skip-link">Ir para o conteúdo</a>
    <Sidebar role={role} />
    <div className="lg:pl-64"><main id="conteudo" className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-7 sm:pt-9 animate-stadium-lights" tabIndex={-1}>
      {/* Ícone de Troféu de Transição */}
      <div className="pointer-events-none fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 animate-trophy-fade text-jj-yellow">
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 22V18" /><path d="M14 22V18" /><path d="M18 4H6v11a6 6 0 0 0 12 0V4Z" />
        </svg>
      </div>

      <div className="mb-6 animate-entrance-title"><p className="section-eyebrow mb-2">{role === "admin" ? "Gestão de campanhas" : "Meu desempenho"}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{subtitle && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">{subtitle}</p>}</div>
      {loading ? <div className="card p-8" role="status"><div className="mb-4 h-2 w-16 animate-pulse rounded-full bg-jj-yellow" /><p className="text-sm text-white/60">Carregando suas campanhas…</p></div> : error ? <div className="card p-6" role="alert"><h2 className="font-bold">Não foi possível carregar os dados</h2><p className="mt-2 text-sm leading-relaxed text-red-200">{error}</p><button className="btn-primary mt-4" onClick={() => void recarregar().catch(() => {})}>Tentar novamente</button></div> : <div className="animate-entrance-content">{children}</div>}
    </main></div>
  </div>;
}
