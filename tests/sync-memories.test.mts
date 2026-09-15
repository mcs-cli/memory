import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import type { TestContext } from "node:test";
import { fixture, qmdStub } from "./helpers.mts";

function indexer(t: TestContext) {
  const f = fixture(t);
  const bin = qmdStub(f.work);
  const calls = `${f.work}/calls`;
  const directory = `${f.project}/.claude/.kb-index`;
  const config = `${directory}/memory-loop.yml`;
  const log = `${directory}/memory-loop.log`;
  const lock = `${directory}/.reindex.lock`;
  const run = (mode = "ok", env: NodeJS.ProcessEnv = {}, cwd = f.project) => {
    writeFileSync(calls, "");
    assert.equal(f.run(`${f.work}/hooks/sync-memories.mts`, {}, { PATH: `${bin}:${process.env.PATH}`, STUB_LOG: calls, STUB_MODE: mode, ...env }, cwd), "");
    return readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  };
  return { ...f, bin, directory, config, log, lock, run };
}

for (const linked of [false, true]) {
  test(`${linked ? "symlinked" : "ordinary"} memories reindex on every invocation`, t => {
    const f = indexer(t);
    if (linked) {
      rmSync(`${f.project}/.claude/memories`, { recursive: true });
      mkdirSync(`${f.project}/.claude/.memories-repo/memories`, { recursive: true });
      symlinkSync(".memories-repo/memories", `${f.project}/.claude/memories`);
    }
    for (let i = 0; i < 2; i++) {
      const calls = f.run();
      assert.deepEqual(calls.map(call => call.args), ["update", "embed", "status", "cleanup"].map(command => ["--index", "memory-loop", command]));
      assert.ok(calls.every(call => call.config === f.directory && call.index === `${f.directory}/memory-loop.sqlite`));
      assert.equal(existsSync(`${f.directory}/memory-loop.sqlite`), true);
      assert.equal(existsSync(f.log), false);
      assert.equal(existsSync(f.lock), false);
    }
    assert.match(readFileSync(f.config, "utf8"), new RegExp(`path: '${f.project}/.claude/memories'`));
  });
}

test("config is registered before memories exist, repaired on drift, and stable otherwise", t => {
  const f = indexer(t);
  rmSync(`${f.project}/.claude/memories`, { recursive: true });
  assert.deepEqual(f.run(), []);
  const expected = readFileSync(f.config, "utf8");
  assert.match(expected, /global_context:/);
  assert.equal(existsSync(`${f.directory}/memory-loop.sqlite`), false);
  utimesSync(f.config, new Date(2000, 0), new Date(2000, 0));
  const before = statSync(f.config);
  f.run();
  assert.equal(statSync(f.config).mtimeMs, before.mtimeMs);
  assert.equal(statSync(f.config).ino, before.ino);
  writeFileSync(f.config, "drift");
  f.run();
  assert.equal(readFileSync(f.config, "utf8"), expected);
});

for (const mode of ["update_fails", "embed_fails", "status_fails", "pending"]) {
  test(`${mode} leaves a diagnostic log and releases its lock`, t => {
    const f = indexer(t);
    const calls = f.run(mode).map(call => call.args[2]);
    assert.equal(calls.includes("cleanup"), false);
    assert.match(readFileSync(f.log, "utf8"), mode === "pending" ? /3 documents still need embedding/ : /exploded/);
    assert.equal(existsSync(f.lock), false);
    f.run();
    assert.equal(existsSync(f.log), false);
  });
}

test("status failure without stderr still leaves a diagnostic and releases its lock", t => {
  const f = indexer(t);
  const calls = f.run("status_fails_silently").map(call => call.args[2]);
  assert.deepEqual(calls, ["update", "embed", "status"]);
  const log = readFileSync(f.log, "utf8");
  assert.match(log, /qmd status failed.*exit 7/);
  assert.match(log, /All collections updated/);
  assert.match(log, /All content hashes already have embeddings/);
  assert.equal(existsSync(f.lock), false);
});

test("cleanup is best effort", t => {
  const f = indexer(t);
  assert.ok(f.run("cleanup_fails").some(call => call.args[2] === "cleanup"));
  assert.equal(existsSync(f.log), false);
});

test("active locks preserve diagnostics; stale empty locks are recovered", t => {
  const f = indexer(t);
  mkdirSync(f.lock, { recursive: true });
  writeFileSync(f.log, "prior error");
  assert.deepEqual(f.run(), []);
  assert.equal(readFileSync(f.log, "utf8"), "prior error");
  const stale = new Date(Date.now() - 7 * 60_000);
  utimesSync(f.lock, stale, stale);
  assert.equal(f.run().length, 4);
  assert.equal(existsSync(f.lock), false);
  mkdirSync(f.lock);
  writeFileSync(`${f.lock}/unexpected`, "keep");
  utimesSync(f.lock, stale, stale);
  assert.deepEqual(f.run(), []);
  assert.equal(existsSync(`${f.lock}/unexpected`), true);
});

test("missing qmd or an unwritable index path silently skips", t => {
  const f = indexer(t);
  assert.deepEqual(f.run("ok", { PATH: f.work }), []);
  assert.equal(existsSync(f.directory), false);
  writeFileSync(f.directory, "blocked");
  assert.deepEqual(f.run(), []);
});

test("lock age keeps the original platform's find -mmin boundary", t => {
  const f = indexer(t);
  mkdirSync(f.lock, { recursive: true });
  const between = new Date(Date.now() - 5.5 * 60_000);
  utimesSync(f.lock, between, between);
  assert.equal(f.run().length, process.platform === "darwin" ? 4 : 0);
});

test("git root wins from subdirectories; fallback honors CLAUDE_PROJECT_DIR and quotes YAML paths", t => {
  const f = indexer(t);
  assert.equal(spawnSync("git", ["init", "-q", f.project]).status, 0);
  const sub = `${f.project}/nested`;
  mkdirSync(sub);
  f.run("ok", { CLAUDE_PROJECT_DIR: `${f.work}/wrong` }, sub);
  assert.equal(existsSync(f.config), true);
  const special = `${f.work}/quoted ' # path: here`;
  mkdirSync(special);
  f.run("ok", { CLAUDE_PROJECT_DIR: special }, f.work);
  assert.match(readFileSync(`${special}/.claude/.kb-index/memory-loop.yml`, "utf8"), /quoted '' # path: here\/\.claude\/memories'/);
});
