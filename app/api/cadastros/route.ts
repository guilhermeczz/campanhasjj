import { ApiError, body, failure, json, rpc, sameOrigin, token } from "@/lib/server";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await token();
    const values = await body(request);
    if (!["campanhas", "marcas", "produtos", "vendedores"].includes(String(values.entidade)) ||
      !values.item || typeof values.item !== "object" || Array.isArray(values.item)) {
      throw new ApiError("Cadastro inválido.");
    }
    const item = { ...values.item } as Record<string, unknown>;
    if (typeof item.id === "string" && item.id.startsWith("local-")) delete item.id;
    return json(await rpc("jj_salvar", { p_token: session, p_entidade: values.entidade, p_item: item }));
  } catch (error) { return failure(error); }
}
