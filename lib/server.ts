import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { origemPermitida } from "./origem";

export const SESSION_COOKIE = "jj_session";
export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function token() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) throw new ApiError("Sua sessão expirou. Entre novamente.", 401);
  return value;
}

export function sameOrigin(request: Request) {
  if (!origemPermitida(request)) {
    throw new ApiError("Origem da solicitação inválida.", 403);
  }
}

export async function body(request: Request, maxBytes = 32_000): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError("Envie dados no formato JSON.", 415);
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ApiError("Arquivo muito grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Dados não informados.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ApiError("Arquivo muito grande.", 413); }
    chunks.push(value);
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError("Os dados enviados são inválidos."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ApiError("Os dados enviados são inválidos.");
  return parsed;
}

export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiError("Configure a conexão com o Supabase para continuar.", 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      if (name === "jj_excluir_produto") throw new ApiError("Falta ativar a exclusão de produtos. Execute supabase/migration_exclusao_produtos.sql no SQL Editor do Supabase.", 503);
      if (["jj_importar_com_auditoria", "jj_auditoria_listar", "jj_auditoria_detalhe", "jj_auditoria_desfazer"].includes(name)) {
        throw new ApiError("Falta ativar a auditoria. Execute supabase/migration_auditoria_importacoes.sql no SQL Editor do Supabase.", 503);
      }
      throw new ApiError("Falta atualizar o banco. Execute supabase/migration_backend_seguro.sql no SQL Editor do Supabase.", 503);
    }
    if (error.code === "P0001" || error.code === "28000" || error.code === "42501") {
      const status = /sessão|sessao|expirada|autentica/i.test(error.message) ? 401 : /permiss|administrador|negado|somente a diretoria/i.test(error.message) ? 403 : 400;
      throw new ApiError(error.message, status);
    }
    if (error.code === "23505") throw new ApiError("Já existe um cadastro com esse código, usuário ou campanha.");
    if (error.code === "23503") throw new ApiError("O cadastro vinculado não existe. Atualize a página e confira os dados.");
    if (error.code?.startsWith("22") || error.code === "23514") throw new ApiError("Confira os campos obrigatórios, datas e valores informados.");
    throw new ApiError("Não foi possível acessar o banco. Tente novamente em instantes.", 503);
  }
  return data as T;
}

export function failure(error: unknown) {
  return json({ error: error instanceof ApiError ? error.message : "Não foi possível concluir. Tente novamente." },
    error instanceof ApiError ? error.status : 500);
}
