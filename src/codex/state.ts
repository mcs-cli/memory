import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import lockfile from 'proper-lockfile';

export const MODEL = 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf';
export const MODES = ['enforce', 'warn', 'observe', 'off'] as const;
export type Mode = typeof MODES[number];
export interface Settings { enabled: boolean; mode: Mode; opt_out?: boolean; plugin_id?: string }
export interface Session { turn: string; queries: number; denials: number[]; brief?: string; pending?: string }
export interface Payload {
  hook_event_name: string; cwd: string; session_id: string; turn_id?: string;
  agent_id?: string; tool_name?: string; tool_input?: Record<string, unknown>; tool_response?: unknown;
}
export const home = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
export const stateDir = (root: string) => path.join(root, '.codex/.memory-loop');
export function project(cwd = process.cwd()): string {
  const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return fs.realpathSync(result.status === 0 ? result.stdout.trim() : cwd);
}
export function read<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw e; }
}
export function atomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = path.join(path.dirname(file), '.' + path.basename(file) + '.' + crypto.randomUUID());
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}
export const write = (file: string, data: unknown) => atomic(file, JSON.stringify(data) + '\n');
export function locked<T>(file: string, work: () => T): T {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const until = Date.now() + 2000;
  let release: (() => void) | undefined;
  while (!release) {
    try { release = lockfile.lockSync(file, { realpath: false, stale: 30000, lockfilePath: file + '.lock' }); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ELOCKED' || Date.now() >= until) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try { return work(); } finally { release(); }
}
export function settings(root: string): Settings {
  const cfg: Settings = { enabled: false, mode: 'enforce',
    ...read(path.join(home(), 'memory-loop/settings.json'), {}),
    ...read(path.join(root, '.codex/memory-loop.local.json'), {}) };
  if (!MODES.includes(cfg.mode)) throw new Error('Invalid Memory Loop gate mode');
  return cfg;
}
export function sessionFile(root: string, session: string): string {
  if (typeof session !== 'string' || !session) throw new Error('Hook session identity missing');
  return path.join(stateDir(root), 'gate', crypto.createHash('sha256').update(session).digest('hex') + '.json');
}
export const readyFile = (file: string) => file + '.ready';
export function usable(file: string, state: Session | null): string | undefined {
  const ready = read<{ turn?: string }>(readyFile(file), {});
  return state && ready.turn === state.turn ? state.brief : undefined;
}
export const environment = (root: string) => ({ ...process.env,
  QMD_CONFIG_DIR: path.join(stateDir(root), 'index'), INDEX_PATH: path.join(stateDir(root), 'index/memory-loop.sqlite'),
  PATH: (process.env.PATH || '') + ':/opt/homebrew/bin:/usr/local/bin' });
export function index(root: string, bundle: string, configureOnly = false): void {
  const result = spawnSync('bash', [path.join(bundle, 'runtime/sync-memories.sh'), ...(configureOnly ? ['--configure-only'] : [])],
    { cwd: root, env: { ...environment(root), MEMORY_LOOP_HOST: 'codex', CLAUDE_PROJECT_DIR: root }, input: '', encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  if (!fs.existsSync(path.join(stateDir(root), 'index/memory-loop.yml'))) throw new Error('Could not publish qmd configuration');
}
export function health(text: string): void {
  if (!/Total:\s*\d+ files indexed/.test(text)) throw new Error('Unrecognized qmd status; indexing health is unknown');
  const match = /Pending:\s*(\d+)\s+need embedding/.exec(text);
  if (text.includes('Pending:') && !match) throw new Error('Unrecognized Pending count');
  if (match && Number(match[1])) throw new Error(match[1] + ' documents still need embedding');
}
