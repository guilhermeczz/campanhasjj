"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace(user.role === "admin" ? "/admin" : "/painel");
  }, [loading, user, router]);

  async function entrar(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErro("");
    const error = await login(username, senha);
    if (error) { setErro(error); setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center px-4 py-10">
    <div className="w-full max-w-md">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-jj-yellow text-xl font-bold text-black">JJ</span>
        <div><p className="font-semibold">Campanhas JJ</p><p className="text-xs text-white/50">Construjota</p></div>
      </div>
      <section className="card p-6 sm:p-8">
        <p className="section-eyebrow">Copa dos Campeões</p>
        <h1 className="mt-3 text-2xl font-semibold">Entre na sua conta</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">Acompanhe suas vendas e sua classificação em cada campanha.</p>
        {loading || user ? <p className="mt-6 text-sm text-white/60" role="status">Preparando seu acesso…</p> : <form onSubmit={entrar} className="mt-6">
          <fieldset disabled={busy} className="space-y-4">
            <div><label htmlFor="username" className="field-label">Usuário</label><input id="username" className="input" required maxLength={80} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Ex.: joao.silva" /></div>
            <div><label htmlFor="senha" className="field-label">Senha de 6 dígitos</label><input id="senha" className="input tracking-widest" type="password" inputMode="numeric" autoComplete="current-password" required pattern="[0-9]{6}" maxLength={6} value={senha} onChange={(event) => setSenha(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" aria-describedby={erro ? "login-erro" : undefined} /></div>
            {erro && <p id="login-erro" className="error-message" role="alert">{erro}</p>}
            <button className="btn-primary w-full" type="submit">{busy ? "Entrando…" : "Entrar"}</button>
          </fieldset>
        </form>}
        <p className="mt-6 text-xs leading-relaxed text-white/55">Para receber seu acesso ou redefinir a senha, procure a diretoria.</p>
      </section>
    </div>
  </main>;
}
