import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { parse } from 'smol-toml';
import { Ownership } from './configuration.js';
import { atomic, environment, health, home, index, locked, MODEL, MODES, project, read, settings, stateDir, write } from './state.js';
const PLUGIN = 'memory-loop@memory-loop';
const IGNORE = '\n# Memory Loop Codex (setup-owned)\n/.codex/.memory-loop/\n/.codex/memory-loop.local.json\n/.codex/config.toml\n# End Memory Loop Codex\n';
const run = (cmd: string, args: string[], opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000, ...opts });
const exists = (cmd: string) => run('/bin/sh', ['-c', 'command -v "$1"', '--', cmd]).status === 0;
export const modelFile = () => path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'qmd/models/hf_Qwen_Qwen3-Embedding-0.6B-Q8_0.gguf');
export function dependencies(): string[] {
  const errors = ['node', 'npm', 'jq', 'qmd', 'codex'].filter(name => !exists(name)).map(name => name + ' is missing');
  if (Number(process.versions.node.split('.')[0]) < 22) errors.push('Node >=22 is required');
  if (exists('qmd') && !/^qmd 2\.8\.3(?: |$)/.test(run('qmd', ['--version']).stdout.trim())) errors.push('qmd must be exactly 2.8.3');
  return errors;
}
function execute(cmd: string, args: string[], env = process.env): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (r.error || r.status !== 0) throw r.error || new Error(cmd + ' failed');
}
function installDependencies(): void {
  if (!exists('jq')) execute('brew', ['install', 'jq']);
  if (!exists('qmd') || !/^qmd 2\.8\.3(?: |$)/.test(run('qmd', ['--version']).stdout.trim())) execute('npm', ['install', '-g', '@tobilu/qmd@2.8.3']);
  if (!fs.existsSync(modelFile())) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-loop-model-'));
    try { execute('qmd', ['--index', 'pull', 'pull', '--progress'], { ...process.env, QMD_CONFIG_DIR: tmp, INDEX_PATH: path.join(tmp, 'pull.sqlite'), QMD_EMBED_MODEL: MODEL, QMD_GENERATE_MODEL: MODEL, QMD_RERANK_MODEL: MODEL }); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}
async function ask(text: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error(text + ' Supply an explicit yes/no option for noninteractive setup.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^(y|yes)$/i.test((await rl.question(text + ' [y/N] ')).trim()) ? 'yes' : 'no'; }
  finally { rl.close(); }
}
const ledger = (root: string, scope: string) => new Ownership(scope === 'global' ? path.join(home(), 'memory-loop/ownership-global.json') : path.join(stateDir(root), 'ownership.json'));
const configPath = (root: string, scope: string) => scope === 'global' ? path.join(home(), 'config.toml') : path.join(root, '.codex/config.toml');
const settingsPath = (root: string, scope: string) => scope === 'global' ? path.join(home(), 'memory-loop/settings.json') : path.join(root, '.codex/memory-loop.local.json');
export function ignore(root: string): void {
  const r = run('git', ['-C', root, 'rev-parse', '--git-path', 'info/exclude']);
  if (r.status) return;
  const file = path.resolve(root, r.stdout.trim());
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!text.includes(IGNORE)) {
    atomic(file, text + IGNORE);
    write(path.join(stateDir(root), 'ignore-ownership.json'), { path: file, block: IGNORE });
  }
}
function unignore(root: string): void {
  const file = path.join(stateDir(root), 'ignore-ownership.json');
  const record = read<{ path: string; block: string } | null>(file, null);
  if (record && fs.existsSync(record.path)) atomic(record.path, fs.readFileSync(record.path, 'utf8').replace(record.block, ''));
  fs.rmSync(file, { force: true });
}
export function configure(root: string, opts: any, setup = false, choices: any = {}): void {
  const own = ledger(root, opts.scope), dest = settingsPath(root, opts.scope), plugin = opts['plugin-id'];
  if (setup) {
    own.set(dest, ['enabled'], true, 'json'); own.set(dest, ['opt_out'], false, 'json'); own.set(dest, ['plugin_id'], plugin, 'json');
    own.set(configPath(root, opts.scope), ['plugins', plugin, 'enabled'], true);
    if (opts.scope === 'project') own.set(path.join(home(), 'config.toml'), ['plugins', plugin, 'enabled'], false);
    own.set(configPath(root, opts.scope), ['features', 'hooks'], true);
    own.set(configPath(root, opts.scope), ['features', 'plugins'], true);
    ignore(root);
  }
  if (opts.mode) own.set(dest, ['mode'], opts.mode, 'json');
  else if (setup && !('mode' in read(dest, {}))) own.set(dest, ['mode'], settings(root).mode, 'json');
  if (opts.enabled) {
    own.set(dest, ['enabled'], opts.enabled === 'yes', 'json'); own.set(dest, ['opt_out'], opts.enabled !== 'yes', 'json');
    own.set(configPath(root, opts.scope), ['plugins', plugin, 'enabled'], opts.enabled === 'yes');
  }
  if (opts.scope === 'project') ignore(root);
  if (setup) {
    const file = configPath(root, opts.scope);
    const memoryKey = ['features', 'memories'];
    const approvalKey = ['plugins', plugin, 'mcp_servers', 'memory-brief', 'tools', 'prepare_brief', 'approval_mode'];
    if (choices['disable-builtin-memory'] === 'yes') own.set(file, memoryKey, false);
    else if (choices['disable-builtin-memory'] === 'no') own.restore(file, memoryKey);
    if (choices['auto-prepare'] === 'yes') own.set(file, approvalKey, 'approve');
    else if (choices['auto-prepare'] === 'no') own.restore(file, approvalKey);
    console.log('Setup saved. In a new Codex session, open /hooks and review/trust Memory Loop hooks. Installation does not grant hook trust. Changed hooks require review again.');
  }
  console.log(JSON.stringify(settings(root), null, 2));
}
export function doctor(root: string, plugin: string, bundle: string): number {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + label + (detail ? ': ' + detail : '')); if (!ok) failures++; };
  for (const error of dependencies()) check('Dependencies', false, error);
  check('Shared Qwen3 model downloaded', fs.existsSync(modelFile()));
  const cfg = settings(root); check('Setup enabled for project', cfg.enabled);
  const binding = read<{ bundle?: string }>(path.join(home(), 'memory-loop/runtime.json'), {});
  const hooks = binding.bundle && path.join(binding.bundle, 'hooks/hooks.json');
  check('Installed runtime binding', binding.bundle === bundle && fs.existsSync(path.join(bundle, 'runtime/codex.cjs')), 'Rerun setup after cache-path changes');
  const fingerprint = hooks && fs.existsSync(hooks) ? crypto.createHash('sha256').update(fs.readFileSync(hooks)).digest('hex') : undefined;
  if (exists('codex')) {
    const r = run('codex', ['plugin', 'list', '--json'], { cwd: root });
    let enabled = false;
    try { enabled = JSON.parse(r.stdout).installed.some((p: any) => p.pluginId === plugin && p.enabled); } catch { /* failed discovery */ }
    check('Plugin installed and enabled', r.status === 0 && enabled, 'Review /plugins if missing');
  }
  const dir = path.join(stateDir(root), 'index'), conf = path.join(dir, 'memory-loop.yml'), log = path.join(dir, 'memory-loop.log');
  check('Model configuration', fs.existsSync(conf) && fs.readFileSync(conf, 'utf8').split(MODEL).length === 4);
  check('Indexing diagnostics', !fs.existsSync(log), fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(-1500) : '');
  if (fs.existsSync(conf) && exists('qmd')) {
    try {
      const r = run('qmd', ['--index', 'memory-loop', 'status'], { env: environment(root) });
      if (r.status) throw new Error(r.stderr || 'qmd status failed');
      health(r.stdout); check('Index status and model', r.stdout.includes('Qwen3-Embedding-0.6B'));
      const count = Number(/Total:\s*(\d+)/.exec(r.stdout)![1]);
      if (count) {
        check('Indexed collection exists', fs.existsSync(path.join(root, '.claude/memories')));
        const q = run('qmd', ['--index', 'memory-loop', 'query', 'vec: past decisions and learnings', '-n', '1', '--format', 'json'], { env: environment(root) });
        const hits = JSON.parse(q.stdout); if (q.status || !hits.length) throw new Error('Search returned no results');
        const get = run('qmd', ['--index', 'memory-loop', 'get', hits[0].docid], { env: environment(root) });
        check('Semantic retrieval and full document', get.status === 0 && !!get.stdout.trim());
      } else check('Empty collection', true, '0 documents; retrieval not exercised');
    } catch (e) { check('Retrieval', false, (e as Error).message); }
  }
  const events = path.join(stateDir(root), 'gate.log');
  const recent = fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => Date.now() - e.ts < 86400000 && e.bundle === binding.bundle && e.hook_hash === fingerprint) : [];
  check('Observed trusted startup hook (last 24h)', recent.some(e => e.event === 'SessionStart'), 'Start a new session after /hooks review');
  if (cfg.mode !== 'off') check('Observed turn hook (last 24h)', recent.some(e => e.decision === 'turn_start'));
  console.log('Gate evaluations / child deliveries observed: ' + recent.filter(e => ['PreToolUse', 'SubagentStart'].includes(e.event)).length);
  return failures ? 1 : 0;
}
export async function manage(argv: string[], bundle: string): Promise<number> {
  const { values: opts, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    project: { type: 'string', default: process.cwd() }, scope: { type: 'string', default: 'global' },
    'plugin-id': { type: 'string', default: PLUGIN }, mode: { type: 'string' }, enabled: { type: 'string' },
    'install-deps': { type: 'boolean' }, 'disable-builtin-memory': { type: 'string' }, 'auto-prepare': { type: 'string' },
    'purge-state': { type: 'boolean' }, help: { type: 'boolean' } } });
  if (opts.help || !positionals.length) { console.log('memory-loop setup|configure|doctor|cleanup [--scope global|project] [--project PATH]\nsetup: --install-deps --disable-builtin-memory yes|no --auto-prepare yes|no\nconfigure: --mode enforce|warn|observe|off --enabled yes|no\ncleanup: --purge-state (explicitly removes this project’s Codex index/logs)\nPlugin identity defaults to memory-loop@memory-loop; override with --plugin-id.'); return 0; }
  if (positionals.length !== 1 || !['setup', 'configure', 'doctor', 'cleanup'].includes(positionals[0])) throw new Error('Unknown command');
  if (!['global', 'project'].includes(opts.scope!)) throw new Error('scope must be global or project');
  if (opts.mode && !MODES.includes(opts.mode as any)) throw new Error('Invalid gate mode');
  for (const key of ['enabled', 'disable-builtin-memory', 'auto-prepare'] as const) if (opts[key] && !['yes', 'no'].includes(opts[key]!)) throw new Error(key + ' must be yes or no');
  const root = project(opts.project), action = positionals[0];
  if (action === 'doctor') return doctor(root, opts['plugin-id']!, bundle);
  let choices: any = {};
  if (action === 'setup') {
    if (opts['install-deps']) installDependencies();
    const missing = dependencies(); if (!fs.existsSync(modelFile())) missing.push('Shared Qwen3 model missing');
    if (missing.length) throw new Error(missing.join('; ') + '. Run setup --install-deps to install dependencies/model explicitly.');
    choices = read(path.join(home(), 'memory-loop/choices.json'), {});
    for (const [field, prompt] of [['disable-builtin-memory', 'Disable Codex built-in memory?'], ['auto-prepare', 'Allow automatic prepare_brief calls without per-call approval?']] as const)
      choices[field] = opts[field] ?? choices[field] ?? await ask(prompt);
  }
  locked(path.join(home(), 'memory-loop/admin'), () => {
    if (action === 'setup') {
      write(path.join(home(), 'memory-loop/choices.json'), choices);
      // Legacy plugin MCP declarations do not expand plugin-root variables.
      // Bind the installed bundle explicitly; MCP inherits the session cwd.
      ledger(root, opts.scope!).set(path.join(home(), 'memory-loop/runtime.json'), ['bundle'], bundle, 'json');
      configure(root, opts, true, choices);
    }
    else if (action === 'configure') configure(root, opts);
    else {
      ledger(root, opts.scope!).cleanup();
      console.log('Owned settings restored where unchanged. Use codex plugin remove ' + opts['plugin-id'] + ' to uninstall the bundle.');
      if (opts['purge-state']) { unignore(root); fs.rmSync(stateDir(root), { recursive: true, force: true }); }
      console.log('Memories, dependencies, and shared model preserved. Indexes/logs remain unless --purge-state was supplied.');
    }
  });
  if (action === 'setup') { index(root, bundle, true); index(root, bundle); }
  return 0;
}
