import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { TestContext } from "node:test";

export const root = resolve(import.meta.dirname, "..");
export const flags = ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"];

export function fixture(t: TestContext) {
  const work = mkdtempSync(`${tmpdir()}/memory-test-`);
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const project = `${work}/project`;
  mkdirSync(`${project}/.claude/memories`, { recursive: true });
  cpSync(`${root}/hooks`, `${work}/hooks`, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, PWD: project };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  const run = (script: string, payload: unknown = {}, overrides: NodeJS.ProcessEnv = {}, cwd = project) => {
    const shell = script.endsWith(".sh");
    const result = spawnSync(shell ? "/bin/bash" : process.execPath, shell ? [script] : [...flags, script], {
      cwd, env: { ...env, ...overrides }, input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    return result.stdout;
  };
  return { work, project, env, run };
}

export function gateFixture(t: TestContext, mode = "enforce") {
  const f = fixture(t);
  const script = `${f.work}/hooks/kb-gate.mts`;
  writeFileSync(script, readFileSync(script, "utf8").replace("__KB_GATE_MODE__", mode));
  const state = `${f.project}/.claude/.kb-gate`;
  const log = `${f.project}/.claude/.kb-gate.log`;
  const event = (hook_event_name: string, extra = {}) => f.run(script, { hook_event_name, session_id: "session", ...extra });
  const turn = () => event("UserPromptSubmit");
  const search = (input: unknown = { query: "some topic" }) => event("PostToolUse", { tool_input: input });
  const spawn = (prompt = "find the thing", subagent_type = "Explore", agent_id = "") => event("PreToolUse", { agent_id, tool_input: { subagent_type, prompt } });
  const lastLog = () => JSON.parse(readFileSync(log, "utf8").trim().split("\n").at(-1)!);
  return { ...f, script, state, log, event, turn, search, spawn, lastLog };
}

export function denied(output: string): void {
  assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, "deny");
}

export function qmdStub(work: string): string {
  const bin = `${work}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/qmd`, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({args, config: process.env.QMD_CONFIG_DIR, index: process.env.INDEX_PATH}) + '\\n');
const command = args[2];
const mode = process.env.STUB_MODE || 'ok';
if (command === 'status' && mode === 'status_fails_silently') process.exit(7);
if (mode === command + '_fails') { console.error(command + ' exploded'); process.exit(1); }
if (command === 'update') { fs.writeFileSync(process.env.INDEX_PATH, ''); console.log('All collections updated.'); }
if (command === 'embed') console.log('All content hashes already have embeddings.');
if (command === 'status') {
  console.log('  Total:    2 files indexed');
  if (mode === 'pending') console.log('  Pending:  3 need embedding');
}
`, { mode: 0o755 });
  return bin;
}
