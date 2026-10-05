import { cookies } from "next/headers";
import { ApiError, body, failure, json, rpc, sameOrigin, SESSION_COOKIE } from "@/lib/server";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";
export async function GET() {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return json({ user: null });
  try {
    const result = await rpc<{ user: User }>("jj_bootstrap", { p_token: session });
    return json({ user: result.user });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      (await cookies()).delete(SESSION_COOKIE);
      return json({ user: null });
    }
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const values = await body(request, 2048);
    if (typeof values.username !== "string" || values.username.length > 100 ||
      typeof values.senha !== "string" || !/^\d{6}$/.test(values.senha)) {
      throw new ApiError("Informe o usuário e a senha de 6 dígitos.");
    }
    const result = await rpc<{ user?: User; token?: string; error?: string }>("jj_login", {
      p_username: values.username.trim().toLowerCase(), p_senha: values.senha
    });
    if (result.error) return json({ error: result.error }, /tentativ|aguarde/i.test(result.error) ? 429 : 401);
    if (!result.user || !result.token) throw new ApiError("Usuário ou senha inválidos.", 401);
    (await cookies()).set(SESSION_COOKIE, result.token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 12 * 60 * 60
    });
    return json({ user: result.user });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const session = (await cookies()).get(SESSION_COOKIE)?.value;
    // O cookie local é removido mesmo se o banco estiver temporariamente indisponível.
    (await cookies()).delete(SESSION_COOKIE);
    if (session) await rpc("jj_logout", { p_token: session });
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
