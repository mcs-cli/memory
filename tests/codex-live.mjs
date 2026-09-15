// Explicit, authenticated macOS CLI integration test. Everything except auth
// and the shared downloaded model lives in a throwaway directory.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const repo = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-loop-live-'));
const marketplace = path.join(temp, 'marketplace'), root = path.join(temp, 'project'), codexHome = path.join(temp, 'home');
const plugin = path.join(marketplace, 'plugins/memory-loop');
fs.mkdirSync(path.join(marketplace, '.agents/plugins'), { recursive: true });
fs.mkdirSync(path.join(root, '.claude/memories'), { recursive: true }); fs.mkdirSync(codexHome);
fs.cpSync(path.join(repo, 'plugins/memory-loop'), plugin, { recursive: true });
fs.writeFileSync(path.join(marketplace, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'memory-loop', plugins: [{ name: 'memory-loop', source: { source: 'local', path: './plugins/memory-loop' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }] }));
const auth = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json');
if (fs.existsSync(auth)) fs.symlinkSync(auth, path.join(codexHome, 'auth.json'));
fs.writeFileSync(path.join(root, '.claude/memories/learning_fixture.md'), '# Fixture context\n**Applies to:** fixture\n\nThe fixture project uses a cache publication mutex to prevent readers seeing incomplete invoices.\nEvidence token: MEMORY_LOOP_LIVE_729.\n');
const env = { ...process.env, CODEX_HOME: codexHome };
function run(cmd, args, opts = {}) { const r = spawnSync(cmd, args, { cwd: root, env, encoding: 'utf8', timeout: 120000, ...opts }); assert.equal(r.status, 0, r.stderr || r.stdout); return r.stdout; }
try {
  run('git', ['init', '-q']);
  run('codex', ['plugin', 'marketplace', 'add', marketplace, '--json']);
  const installed = JSON.parse(run('codex', ['plugin', 'add', 'memory-loop@memory-loop', '--json']));
  const cli = path.join(installed.installedPath, 'scripts/memory-loop');
  run(cli, ['setup', '--disable-builtin-memory', 'no', '--auto-prepare', 'yes']);
  // Saved choices permit a noninteractive setup rerun with no approval changes.
  const ownership = fs.readFileSync(path.join(codexHome, 'memory-loop/ownership-global.json'), 'utf8');
  run(cli, ['setup']);
  assert.equal(fs.readFileSync(path.join(codexHome, 'memory-loop/ownership-global.json'), 'utf8'), ownership);
  console.log('PASS isolated standalone marketplace install and setup');
  const prompt = `This is an authorized Memory Loop integration fixture. Use only the Memory Loop query, get, prepare_brief and collaboration tools. Do not edit files or capture memories. Search for invoice cache publication, retrieve the full result, then prepare a shared brief containing the evidence token from it. Spawn two sibling children with no parent history and generic prompts that do NOT include the evidence token. The first must return the evidence token from its hook-injected shared project context. The second must spawn one grandchild with no parent history and a generic prompt, and return that grandchild's evidence token. Do not put the token in any child or grandchild prompt. Wait for all children. Report their results. Do not override any child model or reasoning setting.`;
  const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--dangerously-bypass-hook-trust', '--sandbox', 'workspace-write', '--json', '-C', root,
    '-c', 'approval_policy="never"', '-c', 'features.apps=false', '-c', 'features.memories=false', '-c', 'features.skip_host_skill_discovery=true', prompt];
  const output = path.join(temp, 'events.jsonl'), errors = path.join(temp, 'stderr.log');
  await new Promise((resolve, reject) => {
    const out = fs.openSync(output, 'w'), err = fs.openSync(errors, 'w');
    const child = spawn('codex', args, { env, cwd: root, stdio: ['ignore', out, err] }); fs.closeSync(out); fs.closeSync(err);
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('CLI fixture timed out')); }, 240000);
    child.on('error', reject); child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`CLI exit ${code}; ${errors}`)); });
  });
  const events = fs.readFileSync(path.join(root, '.codex/.memory-loop/gate.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert(events.some(e => e.event === 'SessionStart'));
  assert(events.some(e => e.decision === 'turn_start'));
  assert(events.some(e => e.decision === 'searched'));
  assert(events.some(e => e.decision === 'preparing'));
  assert(events.filter(e => e.decision === 'allow').length >= 2);
  assert(events.some(e => e.decision === 'nested_exempt'));
  assert(events.filter(e => e.decision === 'briefed').length >= 3);
  const text = fs.readFileSync(output, 'utf8'); assert(text.includes('MEMORY_LOOP_LIVE_729'));
  console.log('PASS real CLI hook activation, search accounting, preparation rewrite, sibling/grandchild briefing, nested exemption');
  run(cli, ['doctor']); console.log('PASS doctor against live observed readiness');
  if (process.argv.includes('--skills')) {
    const memory = path.join(root, '.claude/memories/learning_fixture.md');
    const before = fs.readFileSync(memory, 'utf8');
    const base = args.slice(0, -1);
    const preference = run('codex', [...base, 'Use the continuous-learning skill to evaluate this proposed capture: "I personally prefer tabs, but this project has no formatting convention, lint rule, team agreement or consistent code evidence for it." Evaluate it under the skill rules. This is the entire finding; do not invent supporting evidence.'], { timeout: 120000 });
    assert.match(preference, /preference/i);
    assert.deepEqual(fs.readdirSync(path.dirname(memory)), ['learning_fixture.md']);
    assert.equal(fs.readFileSync(memory, 'utf8'), before);
    const audit = run('codex', [...base, 'Use memory-audit to audit the one fixture memory in this project. This authorizes assessment only; I have not approved any changes. Produce the verdict table for the first batch, then wait for my approval.'], { timeout: 120000 });
    assert.match(audit, /KEEP|DROP|UPDATE/);
    assert.equal(fs.readFileSync(memory, 'utf8'), before);
    console.log('PASS live skill scenarios: personal preference rejected; audit assessment stops without unapproved mutation');
  }
  run(cli, ['cleanup', '--purge-state']); assert(fs.existsSync(path.join(root, '.claude/memories/learning_fixture.md')));
  console.log('PASS cleanup preserves memories');
  fs.rmSync(temp, { recursive: true, force: true });
} catch (e) { console.error('Fixture retained for diagnosis: ' + temp); throw e; }
