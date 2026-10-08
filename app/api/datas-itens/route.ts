import { ApiError, body, failure, json, rpc, sameOrigin, token } from "@/lib/server";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await token();
    const values = await body(request, 400000);
    if (!Array.isArray(values.ids) || values.ids.length > 5000) throw new ApiError("Informe até 5.000 itens para consulta.");
    if (!values.ids.every((id) => typeof id === "string" && id.trim() && id.length <= 160)) throw new ApiError("Itens inválidos para consulta.");
    return json(await rpc("jj_datas_itens", { p_token: session, p_ids: values.ids }));
  } catch (error) { return failure(error); }
}
