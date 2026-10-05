import { ApiError, failure, json, rpc, token } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const data = await rpc<Record<string, unknown>>("jj_bootstrap", { p_token: await token() });
    if (!Array.isArray(data.pontuacoes) || data.versao_regras !== 3) {
      throw new ApiError("Falta atualizar o banco para os pontos por valor e o cadastro de produtos. Execute a versão atual de supabase/migration_backend_seguro.sql no SQL Editor do Supabase.", 503);
    }
    return json(data);
  }
  catch (error) { return failure(error); }
}
