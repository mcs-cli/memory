import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fixture, gateFixture, root, flags } from "./helpers.mts";

const messages = JSON.parse(readFileSync(`${root}/tests/fixtures/hook-messages.json`, "utf8"));
const manifest = readFileSync(`${root}/techpack.yaml`, "utf8");

test("hook messages match the original shell output byte for byte", t => {
  for (const mode of ["enforce", "warn"]) {
    const f = gateFixture(t, mode);
    f.turn();
    assert.equal(f.spawn(), `${JSON.stringify(messages[mode])}\n`);
    assert.equal(f.event("SubagentStart", { agent_type: "Explore" }), `${JSON.stringify(messages.brief)}\n`);
  }
  const f = fixture(t);
  assert.equal(f.run(`${root}/hooks/continuous-learning-activator.mts`), messages.activator);
});

for (const type of ["commonjs", "module"]) {
  test(`manifest hook layout works in a ${type} consumer`, t => {
    const f = fixture(t);
    writeFileSync(`${f.project}/package.json`, JSON.stringify({ type }));
    const hooks = manifest.split(/^  - id: /m).filter(component => /\n    hookEvent:/.test(component));
    assert.equal(hooks.length, 7);
    assert.match(manifest, /hook:\n      source: hooks\/shared.mts\n      destination: shared.mts/);
    const installed = `${f.project}/.claude/hooks/memory`;
    mkdirSync(installed, { recursive: true });
    cpSync(`${root}/hooks/shared.mts`, `${installed}/shared.mts`);
    for (const component of hooks) {
      const source = component.match(/source: (\S+)/)![1]!;
      const destination = component.match(/destination: (\S+)/)![1]!;
      const event = component.match(/hookEvent: (\S+)/)![1]!;
      assert.match(component, /hookInterpreter: node --experimental-strip-types --disable-warning=ExperimentalWarning/);
      writeFileSync(`${installed}/${destination}`, readFileSync(`${root}/${source}`, "utf8").replace("__KB_GATE_MODE__", "enforce"));
      const output = f.run(`${installed}/${destination}`, { hook_event_name: event, session_id: "install", agent_type: "Explore", tool_input: { subagent_type: "Explore", query: "topic", prompt: "KB context: none relevant." } }, { PATH: f.work });
      if (event === "SubagentStart") assert.equal(JSON.parse(output).hookSpecificOutput.hookEventName, event);
    }
    assert.match(manifest, /hookMatcher: "Agent\|Task"/);
    assert.match(manifest, /hookMatcher: "mcp__memory-loop__query"/);
    assert.equal((manifest.match(/hookAsync: true/g) ?? []).length, 2);
    assert.equal((manifest.match(/hookTimeout: 120/g) ?? []).length, 2);
  });
}

test("the SYNC verifier catches missing and divergent blocks", t => {
  const f = fixture(t);
  for (const path of ["scripts", "skills", "SYNC-BLOCKS.md"]) cpSync(`${root}/${path}`, `${f.work}/${path}`, { recursive: true });
  const script = `${f.work}/scripts/check-sync-blocks.mts`;
  assert.equal(spawnSync(process.execPath, [...flags, script]).status, 0);
  const reference = `${f.work}/SYNC-BLOCKS.md`;
  const original = readFileSync(reference, "utf8");
  writeFileSync(reference, original.replace("Every memory must satisfy all three rules.", "Drift."));
  assert.equal(spawnSync(process.execPath, [...flags, script]).status, 1);
  writeFileSync(reference, original.replace("<!-- SYNC:capture-rules -->", "<!-- missing -->"));
  assert.equal(spawnSync(process.execPath, [...flags, script]).status, 1);
  writeFileSync(reference, `${original}\n<!-- SYNC:capture-rules -->\nExtra copy\n<!-- /SYNC -->\n`);
  assert.equal(spawnSync(process.execPath, [...flags, script]).status, 1);
});

test("hooks and tests have no shell files", () => {
  for (const directory of ["hooks", "tests"]) assert.equal(readdirSync(`${root}/${directory}`).some(file => file.endsWith(".sh")), false);
});
