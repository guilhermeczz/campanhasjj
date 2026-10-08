import { ApiError, failure, json, rpc, token } from "@/lib/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await token();
    const params = new URL(request.url).searchParams;
    const campanha = params.get("campanha") || "";
    if (!UUID.test(campanha)) throw new ApiError("Selecione uma campanha válida.");
    const vendedor = params.get("vendedor") || "";
    if (vendedor && !UUID.test(vendedor)) throw new ApiError("Selecione um vendedor válido.");
    return json(await rpc("jj_evolucao_campanha", { p_token: session, p_campanha_id: campanha, p_vendedor_id: vendedor || null }));
  } catch (error) { return failure(error); }
}
