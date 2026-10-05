import { spawnSync } from 'node:child_process';
import { accessSync } from 'node:fs';

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
// Fail explicitly when a required suite is missing, even on Node versions that skip it.
accessSync('test/importacao.test.ts');
accessSync('test/produtos.test.ts');
accessSync('test/backend.test.mjs');
accessSync('test/acompanhamento.test.ts');
accessSync('test/origem.test.ts');
accessSync('test/auditoria.test.mjs');
run(['node_modules/typescript/bin/tsc', '--project', 'tsconfig.test.json']);
run(['--test', '.test-build/test/importacao.test.js', '.test-build/test/produtos.test.js', '.test-build/test/acompanhamento.test.js', '.test-build/test/origem.test.js', 'test/backend.test.mjs', 'test/auditoria.test.mjs']);
