/** Cliente da API. A sessão permanece no cookie HttpOnly. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "Não foi possível concluir. Tente novamente.");
  return result as T;
}

