import { ApiError, body, failure, json, rpc, sameOrigin, token } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await token();
    const dados = await body(request);
    if (typeof dados.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dados.id)) throw new ApiError("Importação inválida.");
    if (dados.confirmar !== true) throw new ApiError("Confirme a ação para desfazer a importação.");
    return json(await rpc("jj_auditoria_desfazer", { p_token: session, p_id: dados.id, p_confirmar: true }));
  } catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  try {
    const session = await token();
    const params = new URL(request.url).searchParams;
    const pagina = Number(params.get("pagina") || "1");
    if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 1000000) throw new ApiError("Página inválida.");
    const id = params.get("id");
    if (id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || pagina > 50) throw new ApiError("Prévia inválida.");
      return json(await rpc("jj_auditoria_detalhe", { p_token: session, p_id: id, p_pagina: pagina }));
    }
    const busca = params.get("busca") || "";
    if (busca.length > 120) throw new ApiError("Use até 120 caracteres na busca.");
    return json(await rpc("jj_auditoria_listar", { p_token: session, p_pagina: pagina, p_busca: busca }));
  } catch (error) { return failure(error); }
}
