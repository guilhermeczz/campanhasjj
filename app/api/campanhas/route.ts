import { ApiError, body, failure, json, rpc, sameOrigin, token } from "@/lib/server";

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const session = await token();
    const values = await body(request, 2048);
    if (typeof values.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.id)) throw new ApiError("Selecione uma campanha válida.");
    if (values.confirmar !== true) throw new ApiError("Confirme a exclusão da campanha.");
    return json(await rpc("jj_excluir_campanha", { p_token: session, p_id: values.id, p_confirmar: true }));
  } catch (error) { return failure(error); }
}
