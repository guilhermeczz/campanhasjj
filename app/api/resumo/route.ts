import { ApiError, failure, json, rpc, token } from "@/lib/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await token();
    const campanha = new URL(request.url).searchParams.get("campanha") || "";
    if (!UUID.test(campanha)) throw new ApiError("Selecione uma campanha válida.");
    return json(await rpc("jj_resumo_campanha", { p_token: session, p_campanha_id: campanha }));
  } catch (error) { return failure(error); }
}
