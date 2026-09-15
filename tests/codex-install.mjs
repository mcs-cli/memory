// Local install/update/cleanup check; no model/API calls.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const bundle = path.resolve(import.meta.dirname, '../plugins/memory-loop');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-loop-install-'));
const marketplace = path.join(tmp, 'marketplace'), root = path.join(tmp, 'project'), home = path.join(tmp, 'home');
fs.mkdirSync(path.join(marketplace, '.agents/plugins'), { recursive: true }); fs.mkdirSync(root); fs.mkdirSync(home);
fs.cpSync(bundle, path.join(marketplace, 'plugins/memory-loop'), { recursive: true });
fs.writeFileSync(path.join(marketplace, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'memory-loop', plugins: [{ name: 'memory-loop', source: { source: 'local', path: './plugins/memory-loop' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }] }));
const env = { ...process.env, CODEX_HOME: home };
function run(cmd, args) { const r = spawnSync(cmd, args, { cwd: root, env, encoding: 'utf8', timeout: 60000 }); assert.equal(r.status, 0, r.stderr || r.stdout); return r.stdout; }
try {
  run('codex', ['plugin', 'marketplace', 'add', marketplace, '--json']);
  const first = JSON.parse(run('codex', ['plugin', 'add', 'memory-loop@memory-loop', '--json']));
  run(path.join(first.installedPath, 'scripts/memory-loop'), ['setup', '--disable-builtin-memory', 'no', '--auto-prepare', 'no']);
  const manifestPath = path.join(marketplace, 'plugins/memory-loop/.codex-plugin/plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); manifest.version = '0.1.1'; fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const next = JSON.parse(run('codex', ['plugin', 'add', 'memory-loop@memory-loop', '--json']));
  assert.notEqual(first.installedPath, next.installedPath);
  const cli = path.join(next.installedPath, 'scripts/memory-loop');
  const before = spawnSync(cli, ['doctor'], { cwd: root, env, encoding: 'utf8' });
  assert.notEqual(before.status, 0); assert.match(before.stdout, /FAIL Installed runtime binding/);
  run(cli, ['setup']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'memory-loop/runtime.json'), 'utf8')).bundle, next.installedPath);
  run(cli, ['cleanup', '--purge-state']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'memory-loop/runtime.json'), 'utf8')).bundle, undefined);
  assert(!fs.existsSync(path.join(root, '.codex/.memory-loop')));
  console.log('PASS standalone install, cache-path update diagnosis, setup rebinding, saved choices, original cleanup ownership');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
