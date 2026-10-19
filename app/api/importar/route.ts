import { ApiError, body, failure, json, rpc, sameOrigin, token } from "@/lib/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const session = await token();
    const values = await body(request, 4_000_000);
    if (!Array.isArray(values.linhas) || !values.linhas.length || values.linhas.length > 5000) {
      throw new ApiError("Envie entre 1 e 5.000 linhas por importação.");
    }
    if (typeof values.campanha_id !== "string" || !UUID.test(values.campanha_id)) {
      throw new ApiError("Selecione a campanha da importação.");
    }
    if (values.arquivo != null && (typeof values.arquivo !== "string" || !values.arquivo.trim() || values.arquivo.length > 255)) {
      throw new ApiError("Nome do arquivo inválido.");
    }
    const linhas = values.linhas.map((linha) => ({ ...(linha as Record<string, unknown>), campanha_id: values.campanha_id, arquivo: values.arquivo ?? "importacao.xlsx" }));
    return json(await rpc("jj_importar", { p_token: session, p_linhas: linhas }));
  } catch (error) { return failure(error); }
}
