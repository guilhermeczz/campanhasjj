"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "./types";
import { api } from "./http";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (username: string, senha: string) => Promise<string | null>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    for (const key of ["jj-user", "jj-vendedores", "jj-vendas", "jj-campanhas", "jj-marcas", "jj-produtos"]) {
      localStorage.removeItem(key);
    }
    let mounted = true;
    api<{ user: User | null }>("/api/session")
      .then(result => { if (mounted) setUser(result.user); })
      .catch(() => { if (mounted) setUser(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function login(username: string, senha: string) {
    if (!username.trim()) return "Informe seu usuário.";
    if (!/^\d{6}$/.test(senha)) return "A senha deve ter exatamente 6 dígitos.";
    try {
      const result = await api<{ user: User }>("/api/session", {
        method: "POST", body: JSON.stringify({ username: username.trim().toLowerCase(), senha })
      });
      setUser(result.user);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Não foi possível entrar. Tente novamente.";
    }
  }
  async function logout() {
    try { await api("/api/session", { method: "DELETE" }); }
    finally { setUser(null); window.location.assign("/login"); }
  }
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

