"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-jj-yellow/20 bg-jj-black/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jj-yellow font-bold text-jj-black">
            JJ
          </div>
          <div className="leading-tight">
            <p className="font-bold text-white">Campanhas JJ</p>
            <p className="text-xs text-jj-yellow">Construjota</p>
          </div>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <span className="hidden rounded-full bg-jj-card px-3 py-1 text-jj-yellow sm:inline">
                {user.nome} • {user.role === "admin" ? "CEO" : "Vendedor"}
              </span>
              {user.role === "admin" ? (
                <Link href="/admin" className="rounded-lg bg-jj-yellow px-3 py-2 font-semibold text-black">
                  Painel CEO
                </Link>
              ) : (
                <Link href="/painel" className="rounded-lg bg-jj-yellow px-3 py-2 font-semibold text-black">
                  Meu painel
                </Link>
              )}
              <button onClick={logout} className="rounded-lg border border-white/20 px-3 py-2 text-white">
                Sair
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded-lg bg-jj-yellow px-4 py-2 font-semibold text-black">
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
