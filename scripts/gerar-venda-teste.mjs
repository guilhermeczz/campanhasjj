// Gera um arquivo de teste no padrão de 7 colunas para validar o fluxo de importação.
// Uso: node scripts/gerar-venda-teste.mjs [vendedor] [marca] [produto]
// Sem argumentos usa valores fictícios (TROCAR-*) que devem ser substituídos por
// um login de vendedor, um código de marca e um produto reais (ver ajuda em Importar vendas).
// O arquivo sai como venda-teste.xlsx na raiz do projeto. Não toca no banco.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { CAMPOS_PLANILHA, MODELO_VENDAS } = require('../.test-build/lib/importacaoGuia.js');

const [vendedor = 'TROCAR-VENDEDOR', marca = 'TROCAR-MARCA', produto = 'TROCAR-PRODUTO'] = process.argv.slice(2);
const titulos = [...MODELO_VENDAS].map((chave) => CAMPOS_PLANILHA.find((c) => c.chave === chave).titulo);
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([titulos,
  ['TESTE-001', vendedor, produto, 2, marca, '10/11/2026 10:00:00', 200],
  ['TESTE-002', vendedor, produto, 1, marca, '11/11/2026 15:30:00', 859.9],
  ['TESTE-003', vendedor, produto, 5, marca, '12/11/2026 09:00:00', 100],
]);
ws['!cols'] = titulos.map(() => ({ wch: 25 }));
XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
writeFileSync('venda-teste.xlsx', Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })));
console.log(JSON.stringify({ arquivo: 'venda-teste.xlsx', colunas: titulos, linhas: 3, vendedor, marca, produto }, null, 2));
console.log('Substitua TROCAR-* por dados reais da ajuda em Importar vendas; a revisão valida tudo antes de salvar.');
