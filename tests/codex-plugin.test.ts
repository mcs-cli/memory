import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { parse } from 'smol-toml';
import { begin, handle, prepare, validate } from '../src/codex/brief.js';
import { hook } from '../src/codex/hooks.js';
import { Ownership } from '../src/codex/configuration.js';
import { configure, manage } from '../src/codex/manage.js';
import { home, Payload, read, sessionFile, stateDir, write } from '../src/codex/state.js';
const repo = path.resolve(import.meta.dirname, '..'), bundle = path.join(repo, 'plugins/memory-loop');

function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-loop-test-'));
  const root = path.join(tmp, 'project'); fs.mkdirSync(path.join(root, '.claude/memories'), { recursive: true });
  const before = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(tmp, 'home');
  write(path.join(home(), 'memory-loop/settings.json'), { enabled: true, mode: 'enforce' });
  const call = (event: string, fields: Partial<Payload> = {}): any => hook({ hook_event_name: event, cwd: root, session_id: 'root', turn_id: 'turn1', ...fields }, bundle);
  const search = (fields = {}) => call('PostToolUse', { tool_name: 'mcp__memory-loop__query', tool_input: { searches: [{ type: 'lex', query: 'cache' }, { type: 'vec', query: 'why does the cache race?' }] }, ...fields });
  const spawn = (fields = {}) => call('PreToolUse', { tool_name: 'collaborationspawn_agent', tool_input: { message: 'opaque' }, ...fields });
  const ticket = (text = '- Reuse the project cache lock.', fields = {}) => call('PreToolUse', { tool_name: 'mcp__memory-brief__prepare_brief', tool_input: { brief: text }, ...fields }).hookSpecificOutput.updatedInput.brief;
  const prep = (text?: string, fields = {}) => prepare(ticket(text, fields));
  const start = (fields = {}) => call('SubagentStart', { agent_id: 'child', ...fields })?.hookSpecificOutput.additionalContext;
  call('UserPromptSubmit');
  return { tmp, root, call, search, spawn, ticket, prep, start,
    close() { if (before === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = before; fs.rmSync(tmp, { recursive: true, force: true }); } };
}
const denied = (o: any) => o?.hookSpecificOutput.permissionDecision === 'deny';
function gateTest(name: string, fn: (f: ReturnType<typeof fixture>) => void | Promise<void>) {
  test(name, async () => { const f = fixture(); try { await fn(f); } finally { f.close(); } });
}
gateTest('search and preparation required; further retrieval preserves briefing', f => {
  assert(denied(f.spawn())); f.search(); assert(denied(f.spawn())); f.prep(); assert.equal(f.spawn(), undefined);
  f.search(); assert.equal(f.spawn(), undefined); assert.match(f.start({ turn_id: 'child-turn' }), /cache lock/);
  assert.match(f.start({ turn_id: 'grandchild-turn' }), /cache lock/);
});
gateTest('every root spawn checked; all nested spawns exempt; child search counts', f => {
  f.search({ agent_id: 'child', turn_id: 'child-turn' }); f.prep('none relevant');
  for (let i = 0; i < 3; i++) assert.equal(f.spawn(), undefined);
  const events = fs.readFileSync(path.join(stateDir(f.root), 'gate.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(events.filter(e => e.decision === 'allow').length, 3);
  f.call('UserPromptSubmit', { turn_id: 'turn2' }); assert.equal(f.spawn({ agent_id: 'child', turn_id: 'nested' }), undefined);
});
gateTest('turn boundaries and simultaneous sessions remain isolated', f => {
  f.search(); f.prep('- SESSION_A'); f.call('UserPromptSubmit', { session_id: 'other' });
  f.search({ session_id: 'other' }); f.prep('- SESSION_B', { session_id: 'other' });
  assert.match(f.start(), /SESSION_A/); assert.match(f.start({ session_id: 'other' }), /SESSION_B/);
  f.call('UserPromptSubmit', { turn_id: 'turn2' }); assert.doesNotMatch(f.start(), /SESSION_A/);
  assert(denied(f.spawn({ turn_id: 'turn2' }))); assert.match(f.start({ session_id: 'other' }), /SESSION_B/);
});
gateTest('replacement invalidates immediately; failed storage cannot acknowledge readiness', f => {
  f.search(); f.prep(); const ticket = f.ticket('- replacement'); assert.match(f.start(), /ONE/); assert(denied(f.spawn()));
  // Make the final readiness publication fail after the brief data is persisted.
  const ready = sessionFile(f.root, 'root') + '.ready'; fs.mkdirSync(ready);
  assert.throws(() => prepare(ticket)); fs.rmdirSync(ready);
  assert.match(f.start(), /ONE/); assert(denied(f.spawn())); f.prep('- recovered'); assert.match(f.start(), /recovered/);
  f.call('PreToolUse', { tool_name: 'mcp__memory-brief__prepare_brief', tool_input: { brief: '- ' + 'x'.repeat(4000) } });
  assert.doesNotMatch(f.start(), /recovered/);
});
gateTest('failed state publication invalidates the old readiness marker', f => {
  f.search(); f.prep(); const file = sessionFile(f.root, 'root');
  const original = fs.renameSync;
  fs.renameSync = (from, to) => { if (to === file) throw new Error('disk full'); original(from, to); };
  try { f.call('PreToolUse', { tool_name: 'mcp__memory-brief__prepare_brief', tool_input: { brief: '- new' } }); }
  finally { fs.renameSync = original; }
  assert.match(f.start(), /ONE/); assert(denied(f.spawn()));
});
gateTest('single-use tickets reject replay, supersession, expired turns and nested preparation', f => {
  const a = f.ticket(), b = f.ticket(); assert.throws(() => prepare(a)); prepare(b); assert.throws(() => prepare(b));
  const c = f.ticket(); f.call('UserPromptSubmit', { turn_id: 'turn2' }); assert.throws(() => prepare(c));
  assert.match(f.call('PreToolUse', { agent_id: 'child', tool_name: 'mcp__memory-brief__prepare_brief', tool_input: { brief: 'none relevant' } }).hookSpecificOutput.additionalContext, /active root/);
});
test('brief validation: no truncation, 1–5 bullets, explicit none, no model-supplied identities', () => {
  for (const bad of ['', 'prose', Array(6).fill('- item').join('\n'), '- ' + 'x'.repeat(3999), null]) assert.throws(() => validate(bad));
  for (const good of ['none relevant', 'KB context: none relevant.', '- one\n- two', '1. item', '- ' + 'x'.repeat(3998)]) assert.equal(validate(good), good);
  assert.throws(() => prepare('- valid but unbound'));
  assert((handle({ method: 'tools/call', params: { name: 'prepare_brief', arguments: { brief: 'none relevant', session_id: 'fake' } } }) as any).isError);
});
gateTest('denial budgets: four per search state, eight total per turn', f => {
  for (let i = 0; i < 4; i++) assert(denied(f.spawn())); assert.equal(f.spawn(), undefined); f.search();
  for (let i = 0; i < 4; i++) assert(denied(f.spawn())); f.search(); assert.equal(f.spawn(), undefined);
  f.call('UserPromptSubmit', { turn_id: 'turn2' }); assert(denied(f.spawn({ turn_id: 'turn2' })));
});
gateTest('concurrent processes cannot exceed denial budget', async f => {
  const results = await Promise.all(Array.from({ length: 12 }, () => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(bundle, 'runtime/codex.cjs'), 'hook'], { env: process.env });
    let output = ''; child.stdout.on('data', b => output += b); child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(String(code))));
    child.stdin.end(JSON.stringify({ hook_event_name: 'PreToolUse', cwd: f.root, session_id: 'root', turn_id: 'turn1', tool_name: 'spawn_agent' }));
  })));
  assert.equal(results.filter(s => s && denied(JSON.parse(s))).length, 4);
});
gateTest('warn, observe, off and opt-out retain intended behavior', f => {
  for (const mode of ['warn', 'observe', 'off']) {
    write(path.join(f.root, '.codex/memory-loop.local.json'), { mode });
    if (mode === 'warn') assert.match(f.spawn().hookSpecificOutput.additionalContext, /Prerequisite/); else assert.equal(f.spawn(), undefined);
    assert.equal(f.start() === undefined, mode === 'off');
  }
  write(path.join(f.root, '.codex/memory-loop.local.json'), { enabled: false, opt_out: true }); assert.equal(f.call('SessionStart'), undefined);
});
gateTest('empty collections gated, missing collections skipped, failed/empty searches ignored', f => {
  assert(denied(f.spawn())); f.search({ tool_response: { isError: true } }); f.prep(); assert(denied(f.spawn()));
  f.call('PostToolUse', { tool_name: 'mcp__memory-loop__query', tool_input: { intent: 'not a search' } }); assert(denied(f.spawn()));
  fs.rmdirSync(path.join(f.root, '.claude/memories')); assert.equal(f.spawn(), undefined);
});
gateTest('nested working directories, separate projects and compaction', f => {
  spawnSync('git', ['init', '-q', f.root]); const nested = path.join(f.root, 'nested'); fs.mkdirSync(nested);
  f.search(); f.prep('- project A'); assert.match(f.call('PostCompact').hookSpecificOutput.additionalContext, /Capture and audit/);
  assert.equal(f.spawn({ cwd: nested }), undefined);
  const other = path.join(f.tmp, 'other'); fs.mkdirSync(other);
  assert.doesNotMatch(f.start({ cwd: other }), /project A/);
});
gateTest('corrupt state fails open at process boundary', f => {
  fs.writeFileSync(sessionFile(f.root, 'root'), '{');
  const r = spawnSync(process.execPath, [path.join(bundle, 'runtime/codex.cjs'), 'hook'], { input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: f.root, session_id: 'root', turn_id: 'turn1', tool_name: 'spawn_agent' }), encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.match(r.stderr, /failed open/);
});
gateTest('cleanup restores only owned scalar values; keeps unrelated text and user edits', f => {
  const file = path.join(f.tmp, 'config.toml'), own = new Ownership(path.join(f.tmp, 'ownership.json'));
  fs.writeFileSync(file, '# header\n[features]\nmemories = true # deliberate\nother = true\n');
  own.set(file, ['features', 'memories'], false); own.set(file, ['plugins', 'memory-loop@memory-loop', 'enabled'], true);
  own.set(file, ['features', 'memories'], false); // Re-run must preserve original baseline.
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"enabled" = true', '"enabled" = false'));
  own.cleanup(); const text = fs.readFileSync(file, 'utf8'), data = parse(text) as any;
  assert.equal(data.features.memories, true); assert.equal(data.plugins['memory-loop@memory-loop'].enabled, false); assert.match(text, /# header/); assert.match(text, /other = true/);
});
gateTest('inline TOML refuses unsafe edits without changing file', f => {
  const file = path.join(f.tmp, 'config.toml'), text = 'features = { memories = true, other = true }\n'; fs.writeFileSync(file, text);
  assert.throws(() => new Ownership(path.join(f.tmp, 'ownership.json')).set(file, ['features', 'memories'], false)); assert.equal(fs.readFileSync(file, 'utf8'), text);
});
gateTest('withdrawing setup consent restores only the previously owned tool and memory settings', f => {
  const opts = { scope: 'global', 'plugin-id': 'memory-loop@memory-loop' };
  configure(f.root, opts, true, { 'disable-builtin-memory': 'yes', 'auto-prepare': 'yes' });
  configure(f.root, opts, true, { 'disable-builtin-memory': 'no', 'auto-prepare': 'no' });
  const config = parse(fs.readFileSync(path.join(home(), 'config.toml'), 'utf8')) as any;
  assert.equal(config.features.memories, undefined);
  assert.equal(config.plugins['memory-loop@memory-loop'].mcp_servers['memory-brief'].tools.prepare_brief.approval_mode, undefined);
  assert.equal(config.plugins['memory-loop@memory-loop'].enabled, true);
});
gateTest('project-only setup, reconfiguration, approval scope and conservative cleanup', async f => {
  spawnSync('git', ['init', '-q', f.root]);
  const opts = { scope: 'project', 'plugin-id': 'memory-loop@memory-loop' };
  configure(f.root, opts, true, { 'disable-builtin-memory': 'no', 'auto-prepare': 'yes' });
  const config = parse(fs.readFileSync(path.join(f.root, '.codex/config.toml'), 'utf8')) as any;
  assert.equal(config.features.memories, undefined);
  assert.equal(config.plugins['memory-loop@memory-loop'].mcp_servers['memory-brief'].tools.prepare_brief.approval_mode, 'approve');
  assert.equal((parse(fs.readFileSync(path.join(home(), 'config.toml'), 'utf8')) as any).plugins['memory-loop@memory-loop'].enabled, false);
  await manage(['configure', '--project', f.root, '--scope', 'project', '--mode', 'warn'], bundle);
  assert.equal(read<any>(path.join(f.root, '.codex/memory-loop.local.json'), {}).mode, 'warn');
  assert.equal(spawnSync('git', ['-C', f.root, 'status', '--porcelain'], { encoding: 'utf8' }).stdout, '');
  const memory = path.join(f.root, '.claude/memories/keep.md'); fs.writeFileSync(memory, 'keep');
  const index = path.join(stateDir(f.root), 'index'); fs.mkdirSync(index); fs.writeFileSync(path.join(index, 'keep.sqlite'), 'index');
  await manage(['cleanup', '--project', f.root, '--scope', 'project'], bundle); assert(fs.existsSync(index));
  await manage(['cleanup', '--project', f.root, '--scope', 'project', '--purge-state'], bundle);
  assert(!fs.existsSync(stateDir(f.root))); assert.equal(fs.readFileSync(memory, 'utf8'), 'keep');
});
test('shared policies and MCS launcher preserved, sources not ignored for updates', () => {
  const capture = fs.readFileSync(path.join(bundle, 'skills/continuous-learning/SKILL.md'), 'utf8');
  const audit = fs.readFileSync(path.join(bundle, 'skills/memory-audit/SKILL.md'), 'utf8');
  const canonical = fs.readFileSync(path.join(repo, 'SYNC-BLOCKS.md'), 'utf8');
  for (const tag of ['capture-rules', 'strip-the-anchors', 'applies-to']) {
    const blocks = [capture, audit, canonical].map(s => s.match(new RegExp('<!-- SYNC:' + tag + ' -->[\\s\\S]*?<!-- /SYNC -->'))?.[0]);
    assert(blocks[0]); assert.equal(blocks[0], blocks[1]); assert.equal(blocks[0], blocks[2]);
  }
  for (const skill of [capture, audit]) assert.match(skill, /allowed-tools:/);
  assert.match(capture, /Never ask the user for permission to save/); assert.match(capture, /Personal preferences/);
  assert.match(audit, /Never delete or edit without explicit per-batch approval/); assert.match(audit, /user-initiated only/);
  const pack = fs.readFileSync(path.join(repo, 'techpack.yaml'), 'utf8');
  const original = spawnSync('git', ['show', 'HEAD:techpack.yaml'], { cwd: repo, encoding: 'utf8' }).stdout;
  assert.equal(pack.split('    mcp:\n')[1].split('    # All three')[0], original.split('    mcp:\n')[1].split('    # All three')[0]);
  for (const name of ['continuous-learning', 'memory-audit']) assert(pack.includes('source: plugins/memory-loop/skills/' + name));
  assert(pack.includes('source: plugins/memory-loop/runtime/sync-memories.sh'));
  assert(!pack.split('\nignore:')[1].split('\ntemplates:')[0].includes('plugins/'));
});
test('bundle runs standalone without npm, Python, MCS or sibling source files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-loop-bundle-'));
  try {
    const standalone = path.join(tmp, 'memory-loop'); fs.cpSync(bundle, standalone, { recursive: true });
    const r = spawnSync(path.join(standalone, 'scripts/memory-loop'), ['--help'], { cwd: tmp, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
    const proc = spawnSync(path.join(standalone, 'scripts/memory-loop'), ['brief-mcp'], { cwd: tmp, encoding: 'utf8', input: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' });
    assert.deepEqual(Object.keys(JSON.parse(proc.stdout).result.tools[0].inputSchema.properties), ['brief']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
