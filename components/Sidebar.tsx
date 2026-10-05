"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

export interface MenuItem { href: string; label: string; icon: string }
export const MENU_ADMIN: MenuItem[] = [
  { href: "/admin", label: "Pontos e resultados", icon: "ranking" },
  { href: "/admin/upload", label: "Importar vendas", icon: "upload" },
  { href: "/admin/auditoria", label: "Auditoria", icon: "sales" },
  { href: "/admin/campanhas", label: "Campanhas", icon: "campaign" },
  { href: "/admin/produtos", label: "Produtos", icon: "brand" },
  { href: "/admin/marcas", label: "Marcas", icon: "brand" },
  { href: "/admin/vendedores", label: "Vendedores", icon: "users" }
];
export const MENU_VENDEDOR: MenuItem[] = [
  { href: "/painel", label: "Minha posição", icon: "ranking" }
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    ranking: <path d="M8 21V11H3v10M15 21V3h-5v18M22 21v-6h-5v6" />,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />,
    campaign: <path d="M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 5 4m7-7h4v3a4 4 0 0 1-5 4M12 12v6m-4 3v-3h8v3" />,
    brand: <><path d="m3 3 8 0 10 10-8 8L3 11V3Z" /><circle cx="7" cy="7" r="1" /></>,
    users: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2" /></>,
    sales: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6" />
  };
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Sidebar({ role }: { role: "admin" | "vendedor" }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState("");
  const menu = role === "admin" ? MENU_ADMIN : MENU_VENDEDOR;
  async function sair() {
    setSaindo(true);
    try { await logout(); } catch { setErro("Não foi possível sair. Tente novamente."); setSaindo(false); }
  }
  const links = menu.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setAberto(false)} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${pathname === item.href ? "bg-jj-yellow text-black" : "text-white/65 hover:bg-white/5 hover:text-white"}`}><NavIcon name={item.icon} />{item.label}</Link>);
  return <>
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between px-4 py-3"><Link href={role === "admin" ? "/admin" : "/painel"} className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-jj-yellow font-bold text-black">JJ</span><span className="text-sm font-bold">Campanhas JJ</span></Link><button className="btn-ghost !px-3 !py-2" aria-expanded={aberto} aria-controls="menu-mobile" onClick={() => setAberto(!aberto)}>{aberto ? "Fechar" : "Menu"}<svg aria-hidden="true" className="ml-2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">{aberto ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg></button></div>
      {aberto && <div id="menu-mobile" className="border-t border-white/10 p-3"><nav aria-label="Menu principal" className="space-y-1">{links}</nav><div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3"><p className="min-w-0 truncate px-3 text-sm text-white/60">{user?.nome}</p><button className="btn-ghost" disabled={saindo} onClick={sair}>{saindo ? "Saindo…" : "Sair"}</button></div>{erro && <p className="error-message mt-2" role="alert">{erro}</p>}</div>}
    </header>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-[#101010] p-5 lg:flex">
      <Link href={role === "admin" ? "/admin" : "/painel"} className="flex items-center gap-3 px-1 py-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-jj-yellow text-xl font-bold text-black">JJ</span><span><span className="block font-semibold">Campanhas JJ</span><span className="text-xs text-white/50">Construjota</span></span></Link>
      <p className="mb-3 mt-8 px-4 text-xs font-bold tracking-wide text-white/55">{role === "admin" ? "Administração" : "Área do vendedor"}</p><nav aria-label="Menu principal" className="flex-1 space-y-1.5">{links}</nav>
      <div className="border-t border-white/10 pt-4"><p className="truncate text-sm font-bold">{user?.nome}</p><p className="mt-1 truncate text-xs text-white/60">@{user?.username}</p><button onClick={sair} disabled={saindo} className="btn-ghost mt-4 w-full">{saindo ? "Saindo…" : "Sair da conta"}</button>{erro && <p className="error-message mt-2" role="alert">{erro}</p>}</div>
    </aside>
  </>;
}
