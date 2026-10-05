import assert from "node:assert/strict";
import { test } from "node:test";
import { acompanharCampanha, evolucaoCampanha, vendasDaCampanha } from "../lib/acompanhamento";
import type { Campanha, Venda, VendedorFull } from "../lib/types";

const campanha: Campanha = { id: "c1", nome: "Campanha", descricao: "", ativa: true, marca_id: "m1", data_inicio: "2026-10-01", data_fim: "2026-12-31" };
const vendedores: VendedorFull[] = [
  { id: "v1", username: "ana", nome: "Ana", role: "vendedor", ativo: true },
  { id: "v2", username: "bruno", nome: "Bruno", role: "vendedor", ativo: true },
  { id: "admin", username: "admin", nome: "Diretoria", role: "admin", ativo: true },
];
const venda = (override: Partial<Venda> = {}): Venda => ({ id: "s1", vendedor_id: "v1", vendedor: "ana", vendedor_nome: "Ana", produto: "Produto", marca_id: "m1", quantidade: 1, campanha: "Campanha", data_faturamento: "2026-10-01T03:00:00Z", status: "faturado", valor_bruto: 100, pontos: 150, ...override });

test("acompanhamento inclui vendedor zerado, sem inventar pontos ou incluir diretoria", () => {
  const rows = acompanharCampanha(campanha, [venda()], vendedores);
  assert.deepEqual(rows.map(v => [v.nome, v.pontos, v.liquido, v.itens]), [["Ana",150,100,1],["Bruno",0,0,0]]);
  assert.equal(rows[1].ultimaVenda, "");
});

test("evolução respeita marca, período em São Paulo e status", () => {
  const itens = [venda(), venda({ id: "s2", pontos: 5, marca_id: "outra" }), venda({ id: "s3", pontos: 200, status: "cancelado" }), venda({ id: "s4", status: "pendente" }), venda({ id: "s5", data_faturamento: "2026-10-01T02:59:59Z" }), venda({ id: "s6", data_faturamento: "2027-01-01T03:00:00Z" }), venda({ id: "s7", data_faturamento: "2027-01-01T02:59:59.999Z", pontos: 30 })];
  assert.equal(vendasDaCampanha(campanha, itens).length, 4);
  assert.deepEqual(evolucaoCampanha(campanha, itens), [{ data: "2026-10-01", pontos: 150, acumulado: 150 }, { data: "2026-12-31", pontos: 30, acumulado: 180 }]);
});

test("histórico excluído permanece e devolução usa os pontos já calculados no servidor", () => {
  const rows = acompanharCampanha(campanha, [venda({ vendedor_id: "excluido", vendedor: "antigo", vendedor_nome: "Antigo", valor_devolucao: 20, valor_cancelamento: 10, pontos: 105 })], vendedores);
  const antigo = rows.find(r => r.id === "excluido")!;
  assert.equal(antigo.excluido, true);
  assert.equal(antigo.pontos, 105);
  assert.equal(antigo.liquido, 70);
  assert.equal(rows.find(r => r.id === "v1")!.pontos, 0);
});

test("filtro individual não soma outro vendedor e correção não acumula valor anterior", () => {
  const itens = [venda({ pontos: 0.1 }), venda({ id: "s2", pontos: 0.2, data_faturamento: "2026-10-02T03:00:00Z" }), venda({ id: "s3", vendedor_id: "v2", pontos: 900 })];
  assert.equal(evolucaoCampanha(campanha, itens, "v1")[1].acumulado, 0.3);
  const corrigidas = itens.map(v => v.id === "s2" ? { ...v, pontos: 0.1 } : v);
  assert.equal(evolucaoCampanha(campanha, corrigidas, "v1")[1].acumulado, 0.2);
  assert.deepEqual(evolucaoCampanha(campanha, [], "v1"), [{ data: "2026-10-01", pontos: 0, acumulado: 0 }]);
});
