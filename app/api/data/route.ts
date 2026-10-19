import { ApiError, failure, json, rpc, token } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const data = await rpc<Record<string, unknown>>("jj_bootstrap", { p_token: await token() });
    if (data.versao_regras !== 4) {
      throw new ApiError("Falta atualizar o banco. Execute a versão atual de supabase/schema.sql no SQL Editor do Supabase.", 503);
    }
    return json(data);
  }
  catch (error) { return failure(error); }
}
