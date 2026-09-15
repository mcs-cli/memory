// Explicit integration test using global qmd 2.8.3 and the already downloaded model.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const bundle = path.resolve(import.meta.dirname, '../plugins/memory-loop');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-loop-qmd-'));
const root = path.join(tmp, "project's #1"), collection = path.join(tmp, 'shared');
fs.mkdirSync(path.join(root, '.claude'), { recursive: true }); fs.mkdirSync(collection);
fs.symlinkSync(collection, path.join(root, '.claude/memories'));
fs.writeFileSync(path.join(collection, 'learning_cache.md'), '# Cache lock discovery\n**Applies to:** fixture\n\nThe fixture project protects invoice cache replacement with a publication mutex.\nUse the existing cache lock before atomically replacing an invoice snapshot.\nEvidence token: FULL_DOCUMENT_729\n');
fs.mkdirSync(path.join(root, 'nested')); fs.mkdirSync(path.join(root, '.qmd'));
fs.writeFileSync(path.join(root, '.qmd/index.yml'), 'user_owned: true\n');
function run(cmd, args, options = {}) { const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 120000, ...options }); assert.equal(r.status, 0, `${cmd}: ${r.stderr}`); return r.stdout; }
run('git', ['init', '-q']);
try {
  for (const host of ['claude', 'codex']) {
    const dir = path.join(root, host === 'claude' ? '.claude/.kb-index' : '.codex/.memory-loop/index');
    const env = { ...process.env, MEMORY_LOOP_HOST: host, QMD_CONFIG_DIR: dir, INDEX_PATH: path.join(dir, 'memory-loop.sqlite') };
    run('bash', [path.join(bundle, 'runtime/sync-memories.sh')], { env, input: '', cwd: path.join(root, 'nested') });
    assert(!fs.existsSync(path.join(dir, 'memory-loop.log')), fs.existsSync(path.join(dir, 'memory-loop.log')) ? fs.readFileSync(path.join(dir, 'memory-loop.log'), 'utf8') : '');
    const result = JSON.parse(run('qmd', ['--index', 'memory-loop', 'query', 'lex: invoice cache\nvec: why does invoice cache replacement need a lock', '--no-rerank', '--format', 'json', '-n', '6'], { env }));
    assert(result.length); assert.match(run('qmd', ['--index', 'memory-loop', 'get', result[0].docid], { env }), /FULL_DOCUMENT_729/);
    const config = fs.readFileSync(path.join(dir, 'memory-loop.yml'), 'utf8'); assert(config.includes('/.claude/memories')); assert(!config.includes(collection));
    // Concurrent incremental runs share one index and preserve honest diagnostics.
    await Promise.all([1, 2, 3].map(() => new Promise((resolve, reject) => {
      const child = spawn('bash', [path.join(bundle, 'runtime/sync-memories.sh')], { env, cwd: root, stdio: ['pipe', 'ignore', 'pipe'] });
      child.stdin.end('{}'); child.on('error', reject); child.on('exit', c => c === 0 ? resolve() : reject(new Error(String(c))));
    })));
    assert(!fs.existsSync(path.join(dir, 'memory-loop.log')));
    console.log(`PASS ${host}: symlink, nested root, lexical+semantic query, full retrieval, concurrent incremental indexing`);
  }
  assert.equal(fs.readFileSync(path.join(root, '.qmd/index.yml'), 'utf8'), 'user_owned: true\n');
  assert(!fs.existsSync(path.join(root, '.qmd/index.sqlite')));
  console.log('PASS user-owned .qmd remains untouched; Claude and Codex indexes are separate');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
