import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { fixture, flags, gateFixture, root } from "./helpers.mts";

const messages = JSON.parse(readFileSync(`${root}/tests/fixtures/hook-messages.json`, "utf8"));
const manifest = readFileSync(`${root}/techpack.yaml`, "utf8");

function field(component: string, key: string): string {
  const value = new RegExp(`${key}: (\\S+)`).exec(component)?.[1];
  assert.ok(value, `component has no ${key}`);
  return value;
}

test("hook messages match the original shell output byte for byte", t => {
  for (const mode of ["enforce", "warn"]) {
    const f = gateFixture(t, mode);
    f.turn();
    assert.equal(f.spawn(), `${JSON.stringify(messages[mode])}\n`);
    assert.equal(f.event("SubagentStart", { agent_type: "Explore" }), `${JSON.stringify(messages.brief)}\n`);
  }
  const f = fixture(t);
  assert.equal(f.run(`${root}/hooks/memory-loop-activator.sh`), messages.activator);
});

for (const type of ["commonjs", "module"]) {
  test(`manifest hook layout works in a ${type} consumer`, t => {
    const f = fixture(t);
    writeFileSync(`${f.project}/package.json`, JSON.stringify({ type }));
    const hooks = manifest.split(/^ {2}- id: /m).filter(component => /\n {4}hookEvent:/.test(component));
    assert.equal(hooks.length, 10);
    assert.match(manifest, /hook:\n {6}source: hooks\/shared.mts\n {6}destination: shared.mts/);
    const installed = `${f.project}/.claude/hooks/memory`;
    mkdirSync(installed, { recursive: true });
    cpSync(`${root}/hooks/shared.mts`, `${installed}/shared.mts`);
    for (const component of hooks) {
      const source = field(component, "source");
      const destination = field(component, "destination");
      const event = field(component, "hookEvent");
      if (destination === "memory-loop-activator.sh") assert.doesNotMatch(component, /hookInterpreter:/);
      else assert.match(component, /hookInterpreter: node --experimental-strip-types --disable-warning=ExperimentalWarning/);
      writeFileSync(`${installed}/${destination}`, readFileSync(`${root}/${source}`, "utf8").replace("__KB_GATE_MODE__", "enforce"));
      const output = f.run(
        `${installed}/${destination}`,
        {
          hook_event_name: event,
          session_id: "install",
          agent_type: "Explore",
          tool_input: { subagent_type: "Explore", query: "topic", prompt: "KB context: none relevant." },
        },
        { PATH: `${f.work}:/usr/bin:/bin` },
      );
      if (destination === "memory-loop-activator.sh") assert.equal(output, messages.activator);
      if (event === "SubagentStart") assert.equal(JSON.parse(output).hookSpecificOutput.hookEventName, event);
    }
    assert.match(manifest, /hookMatcher: "Agent\|Task"/);
    assert.match(manifest, /hookMatcher: "mcp__memory-loop__query"/);
    assert.match(manifest, /hookMatcher: "Skill"/);
    assert.match(manifest, /hookMatcher: "mcp__memory-loop__get\|mcp__memory-loop__multi_get\|Read"/);
    assert.match(manifest, /hookMatcher: "Write\|Edit\|NotebookEdit\|Bash"/);
    assert.equal((manifest.match(/hookAsync: true/g) ?? []).length, 3);
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

test("only the static activator remains a shell script", () => {
  assert.deepEqual(
    readdirSync(`${root}/hooks`).filter(file => file.endsWith(".sh")),
    ["memory-loop-activator.sh"],
  );
  assert.equal(
    readdirSync(`${root}/tests`).some(file => file.endsWith(".sh")),
    false,
  );
});
