import { ApiError, body, failure, json, rpc, sameOrigin, token } from "@/lib/server";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await token();
    const values = await body(request, 2_000_000);
    if (!Array.isArray(values.linhas) || !values.linhas.length || values.linhas.length > 5000) throw new ApiError("Envie entre 1 e 5.000 produtos por arquivo.");
    return json(await rpc("jj_importar_produtos", { p_token: session, p_linhas: values.linhas }));
  } catch (error) { return failure(error); }
}
