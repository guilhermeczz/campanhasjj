import assert from "node:assert/strict";
import { test } from "node:test";
import { origemPermitida } from "../lib/origem";

test("origem local usa Host mesmo quando Next normaliza request.url", () => {
  const r = new Request("http://localhost:3000/api/importar", { headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" } });
  assert.equal(origemPermitida(r), true);
});
test("origem da Vercel conserva HTTPS atrás do proxy", () => {
  const r = new Request("http://localhost:3000/api/importar", { headers: { host: "campanhasjj.vercel.app", origin: "https://campanhasjj.vercel.app", "x-forwarded-proto": "https" } });
  assert.equal(origemPermitida(r), true);
});
test("origem externa, porta diferente, origem null e forwarded-host adulterado são rejeitados", () => {
  for (const origin of ["http://externo.example", "null", "http://127.0.0.1:3001", "http://localhost:3000"]) {
    assert.equal(origemPermitida(new Request("http://localhost:3000/api/importar", { headers: { host: "127.0.0.1:3000", origin, "x-forwarded-host": "externo.example" } })), false);
  }
  assert.equal(origemPermitida(new Request("http://localhost:3000/api/importar", { headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "cross-site" } })), false);
});
