import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import test from "node:test";
import { denied, gateFixture, root } from "./helpers.mts";

const kb = "KB context: none relevant.";

test("a fresh search and prompt block satisfy the barrier; every turn resets it", t => {
  const f = gateFixture(t);
  f.turn();
  f.search();
  assert.equal(f.spawn(kb), "");
  assert.equal(f.lastLog().satisfied, true);
  f.turn();
  denied(f.spawn(kb));
  assert.equal(readFileSync(`${f.state}/session.turn`, "utf8"), "2\n");
});

test("fan-out is denied and complying re-arms the gate", t => {
  const f = gateFixture(t);
  f.turn();
  denied(f.spawn());
  denied(f.spawn());
  f.search();
  assert.equal(f.spawn(kb), "");
  denied(f.spawn());
  assert.equal(f.lastLog().denials_state, 1);
  assert.equal(f.lastLog().denials_turn, 3);
});

test("no-progress and per-turn budgets release at their boundaries", t => {
  const f = gateFixture(t);
  f.turn();
  for (let i = 0; i < 4; i++) denied(f.spawn());
  assert.equal(f.spawn(), "");
  assert.equal(f.lastLog().skip_reason, "budget_no_progress");
  assert.equal(f.spawn(), "");
  f.turn();
  for (let i = 0; i < 8; i++) {
    denied(f.spawn());
    f.search({ query: `topic ${i}` });
  }
  assert.equal(f.spawn(), "");
  assert.equal(f.lastLog().skip_reason, "budget_turn");
});

test("nested calls, other agents and absent KBs skip", t => {
  const f = gateFixture(t);
  f.turn();
  assert.equal(f.spawn("none", "Explore", "agent-42"), "");
  assert.equal(f.lastLog().skip_reason, "nested_subagent");
  assert.equal(f.spawn("none", "code-reviewer"), "");
  assert.equal(f.lastLog().skip_reason, "agent_type_not_gated");
  rmSync(`${f.project}/.claude/memories`, { recursive: true });
  assert.equal(f.spawn(), "");
  assert.equal(f.lastLog().skip_reason, "no_memories_dir");
});

for (const mode of ["warn", "observe", "off", "__KB_GATE_MODE__"]) {
  test(`${mode} never denies`, t => {
    const f = gateFixture(t, mode);
    f.turn();
    const output = f.spawn();
    if (mode === "warn" || mode === "__KB_GATE_MODE__") {
      assert.match(JSON.parse(output).hookSpecificOutput.additionalContext, /KB protocol:/);
      assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, undefined);
    } else assert.equal(output, "");
    if (mode === "off") {
      assert.equal(existsSync(f.state), false);
      assert.equal(existsSync(f.log), false);
    } else assert.equal(f.lastLog().decision, mode === "observe" ? "observe" : "warn");
  });
}

test("both search shapes count, intent alone does not; query text is retained", t => {
  const f = gateFixture(t);
  f.turn();
  f.search({ query: "plain query\nwith tabs\tand trailing newline\n" });
  assert.equal(readFileSync(`${f.state}/session.queries`, "utf8"), "1\tplain query\nwith tabs\tand trailing newline\n");
  f.search({ searches: [{ type: "lex", query: "counter state" }, { type: "vec", query: "why not wall clock" }] });
  assert.match(readFileSync(`${f.state}/session.queries`, "utf8"), /counter state why not wall clock/);
  assert.equal(f.spawn(kb), "");
  f.turn();
  f.search({ intent: "context only" });
  denied(f.spawn(kb));
  f.search({ query: "", searches: [{ type: "lex", query: "fallback" }] });
  assert.equal(f.spawn(kb), "");
});

test("discovery agents receive the same briefing and marker as the template", t => {
  const f = gateFixture(t);
  for (const agent_type of ["Explore", "general-purpose", "Plan"]) {
    const output = JSON.parse(f.event("SubagentStart", { agent_type })).hookSpecificOutput;
    assert.equal(output.hookEventName, "SubagentStart");
    assert.match(output.additionalContext, /KB context:/);
    assert.match(output.additionalContext, /rerank:false and limit:6/);
    assert.match(output.additionalContext, /get a document before relying/);
    assert.equal(f.lastLog().decision, "briefed");
  }
  assert.match(readFileSync(`${root}/templates/continuous-learning.md`, "utf8"), /KB context:/);
  assert.equal(f.event("SubagentStart", { agent_type: "code-reviewer" }), "");
  rmSync(`${f.project}/.claude/memories`, { recursive: true });
  assert.equal(f.event("SubagentStart", { agent_type: "Explore" }), "");
});

test("malformed payloads fail open without output or state", t => {
  const f = gateFixture(t);
  for (const payload of ["", "{", "null", "42", "[]", { tool_input: { prompt: 4 } }, { hook_event_name: "unknown" }]) {
    assert.equal(f.run(f.script, payload), "");
  }
  assert.equal(existsSync(f.state), false);
  assert.equal(existsSync(f.log), false);
});

test("sessions are isolated and sanitized; missing or corrupt counters start at zero", t => {
  const f = gateFixture(t);
  f.search();
  assert.equal(f.spawn(kb), "");
  f.turn();
  f.search();
  denied(f.event("PreToolUse", { session_id: "../another/session", tool_input: { subagent_type: "Plan", prompt: kb } }));
  assert.equal(f.lastLog().session, ".._another_session");
  writeFileSync(`${f.state}/session.turn`, "not a number\n");
  f.turn();
  assert.equal(readFileSync(`${f.state}/session.turn`, "utf8"), "1\n");
});

test("old session files are swept only on a first turn", t => {
  const f = gateFixture(t);
  f.turn();
  const old = `${f.state}/ancient.turn`;
  writeFileSync(old, "1\n");
  utimesSync(old, new Date(2000, 0), new Date(2000, 0));
  f.turn();
  assert.equal(existsSync(old), true);
  f.event("UserPromptSubmit", { session_id: "new-session" });
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(`${f.state}/session.turn`), true);
});

test("logs retain a bounded tail and leave small files in place", t => {
  const f = gateFixture(t);
  f.turn();
  writeFileSync(f.log, `${"x".repeat(180)}\n`.repeat(4000));
  f.turn();
  assert.equal(readFileSync(f.log, "utf8").trim().split("\n").length, 1001);
  assert.ok(statSync(f.log).size < 524288 / 2);
  const inode = statSync(f.log).ino;
  f.turn();
  assert.equal(statSync(f.log).ino, inode);
  assert.equal(readdirSync(f.state).some(name => name.endsWith(".tmp")), false);
});

test("an unavailable state directory fails open", t => {
  const f = gateFixture(t);
  writeFileSync(f.state, "blocked");
  assert.equal(f.turn(), "");
  assert.equal(f.search(), "");
});
