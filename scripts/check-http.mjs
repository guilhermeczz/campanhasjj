import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://127.0.0.1:3000';
const origin = new URL(base).origin;
const pages = ['/login', '/admin', '/admin/campanhas', '/admin/marcas', '/admin/produtos', '/admin/upload', '/admin/vendedores', '/admin/auditoria', '/painel', '/painel/vendas'];
for (const page of pages) {
  const response = await fetch(new URL(page, base));
  assert.equal(response.status, 200, page);
}
for (const [path,method] of [['/api/data','GET'],['/api/importar','POST'],['/api/produtos/importar','POST'],['/api/cadastros','POST'],['/api/vendedores','DELETE'],['/api/auditoria','GET'],['/api/auditoria','POST']]) {
  const response = await fetch(new URL(path, base), { method, headers: { origin, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: '{}' }) });
  assert.equal(response.status, 401, `${method} ${path}`);
}
const cross = await fetch(new URL('/api/session', base), { method: 'POST', headers: { origin: 'https://origem-externa.example', 'Content-Type':'application/json' }, body: '{}' });
assert.equal(cross.status, 403);
const crossUndo = await fetch(new URL('/api/auditoria', base), { method: 'POST', headers: { origin: 'https://origem-externa.example', 'Content-Type':'application/json' }, body: '{}' });
assert.equal(crossUndo.status, 403);
const malformed = await fetch(new URL('/api/session', base), { method: 'POST', headers: { origin, 'Content-Type':'application/json' }, body: JSON.stringify({ username: 'formato-invalido', senha: 'abc' }) });
assert.equal(malformed.status, 400);
console.log('HTTP: 10 páginas disponíveis; 7 operações de API protegidas; origem externa e login malformado rejeitados. Nenhum cadastro alterado.');
