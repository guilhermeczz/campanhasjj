import { ApiError, body, failure, json, rpc, sameOrigin, token } from "@/lib/server";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await token();
    const values = await body(request, 4_000_000);
    if (!Array.isArray(values.linhas) || !values.linhas.length || values.linhas.length > 5000) {
      throw new ApiError("Envie entre 1 e 5.000 linhas por importação.");
    }
    if (values.arquivo != null && (typeof values.arquivo !== "string" || !values.arquivo.trim() || values.arquivo.length > 255)) throw new ApiError("Nome do arquivo inválido.");
    return json(await rpc("jj_importar_com_auditoria", { p_token: session, p_linhas: values.linhas, p_arquivo: values.arquivo ?? null }));
  } catch (error) { return failure(error); }
}
