import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
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
  f.search({
    searches: [
      { type: "lex", query: "counter state" },
      { type: "vec", query: "why not wall clock" },
    ],
  });
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
  assert.equal(
    readdirSync(f.state).some(name => name.endsWith(".tmp")),
    false,
  );
});

test("an unavailable state directory fails open", t => {
  const f = gateFixture(t);
  writeFileSync(f.state, "blocked");
  assert.equal(f.turn(), "");
  assert.equal(f.search(), "");
});

test("memory writes need continuous-learning in the same turn", t => {
  const f = gateFixture(t);
  f.turn();
  denied(f.write());
  assert.equal(f.lastLog().phase, "memory_write");
  f.skill();
  assert.equal(f.write(), "");
  assert.equal(f.write({ tool_name: "Edit" }), "");
  assert.equal(f.lastLog().decision, "allow");
  f.turn();
  assert.match(denied(f.write()).permissionDecisionReason, /Invoke Skill\(continuous-learning\)/);
});

test("memory-audit authorizes writes for the rest of the session", t => {
  const f = gateFixture(t);
  f.turn();
  f.skill("memory-audit");
  f.turn("approved");
  f.turn("apply batch 2");
  assert.equal(f.write(), "");
  assert.equal(f.lastLog().skill, "memory-audit");
});

test("slash commands anywhere in the prompt count; paths and other skills do not", t => {
  const f = gateFixture(t);
  f.turn("/continuous-learning");
  assert.equal(f.write(), "");
  f.turn("fix the parser, then /memory:continuous-learning please");
  assert.equal(f.write(), "");
  f.turn("<command-message>continuous-learning</command-message>\n<command-name>/continuous-learning</command-name>");
  assert.equal(f.write(), "");
  f.turn("read skills/continuous-learning/SKILL.md");
  denied(f.write());
  f.turn();
  f.skill("simplify");
  denied(f.write());
  f.skill("memory:continuous-learning");
  assert.equal(f.write(), "");
});

test("writes through a symlinked memories dir are gated; outside paths pass silently", t => {
  const f = gateFixture(t);
  rmSync(`${f.project}/.claude/memories`, { recursive: true });
  mkdirSync(`${f.work}/repo/memories`, { recursive: true });
  symlinkSync(`${f.work}/repo/memories`, `${f.project}/.claude/memories`);
  f.turn();
  denied(f.write({ file_path: `${f.work}/repo/memories/decision_y.md` }));
  denied(f.write({ file_path: `${f.project}/.claude/memories/decision_y.md`, tool_name: "NotebookEdit" }));
  const before = readFileSync(f.log, "utf8");
  assert.equal(f.write({ file_path: `${f.project}/src/app.ts` }), "");
  assert.equal(f.write({ file_path: `${f.project}/.claude/memories-notes.md` }), "");
  assert.equal(readFileSync(f.log, "utf8"), before);
});

test("sub-agents are always denied memory writes", t => {
  const f = gateFixture(t);
  f.turn();
  f.skill("memory-audit");
  for (let i = 0; i < 5; i++) denied(f.write({ agent_id: "agent-7" }));
  assert.equal(f.lastLog().skip_reason, "subagent");
});

test("the memory-write budget releases after three denials, independent of discovery", t => {
  const f = gateFixture(t);
  f.turn();
  denied(f.spawn());
  for (let i = 0; i < 3; i++) denied(f.write());
  assert.equal(f.write(), "");
  assert.equal(f.lastLog().skip_reason, "budget_turn");
  denied(f.spawn());
  f.turn();
  denied(f.write());
});

for (const mode of ["warn", "observe", "__KB_GATE_MODE__"]) {
  test(`${mode} still denies memory writes`, t => {
    const f = gateFixture(t, mode);
    f.turn();
    denied(f.write());
  });
}

test("off skips memory writes and records no usage", t => {
  const f = gateFixture(t, "off");
  f.memories("learning_a.md");
  f.turn();
  assert.equal(f.write(), "");
  f.retrieve(["learning_a.md"]);
  assert.equal(existsSync(f.state), false);
  assert.equal(existsSync(f.usagePath), false);
});

test("deleting or moving memories through Bash needs memory-audit", t => {
  const f = gateFixture(t);
  f.turn();
  f.skill();
  assert.match(denied(f.bash("rm .claude/memories/learning_x.md")).permissionDecisionReason, /memory-audit/);
  assert.equal(f.lastLog().phase, "memory_delete");
  denied(f.bash("git -C .claude/.memories-repo rm -- memories/learning_x.md"));
  denied(f.bash("mv .claude/memories/a.md .claude/memories/b.md"));
  f.turn();
  f.skill("memory-audit");
  f.turn("approved");
  assert.equal(f.bash("rm .claude/memories/learning_x.md"), "");
  assert.equal(f.lastLog().skill, "memory-audit");
});

test("unrelated Bash commands pass without evaluation", t => {
  const f = gateFixture(t);
  f.turn();
  const before = readFileSync(f.log, "utf8");
  for (const command of [
    "ls .claude/memories",
    "rm build/tmp.txt",
    "docker run --rm memories-image",
    "grep -rn memories . | wc -l",
    "cat .claude/memories/a.md | grep rm",
  ]) {
    assert.equal(f.bash(command), "");
  }
  assert.equal(readFileSync(f.log, "utf8"), before);
});

test("sub-agents cannot delete memories even under memory-audit", t => {
  const f = gateFixture(t);
  f.turn();
  f.skill("memory-audit");
  denied(f.bash("rm .claude/memories/learning_x.md", "agent-3"));
  assert.equal(f.lastLog().skip_reason, "subagent");
});

const today = () => new Date().toISOString().slice(0, 10);

test("get, multi_get and Read record the day each existing memory was retrieved", t => {
  const f = gateFixture(t);
  f.memories("learning_a.md", "decision_b.md", "learning_c.md");
  f.turn();
  f.retrieve(["learning_a.md"]);
  f.retrieve(["decision_b.md", "learning_missing.md"], "mcp__memory-loop__multi_get");
  f.readMemory(`${f.project}/.claude/memories/learning_c.md`);
  const recorded = `# since: ${today()}\nlearning_a.md\t${today()}\ndecision_b.md\t${today()}\nlearning_c.md\t${today()}\n`;
  assert.equal(f.usage(), recorded);
  assert.deepEqual(f.lastLog().files, ["learning_c.md"]);
  f.retrieve(["learning_a.md"]);
  f.readMemory(f.usagePath);
  f.readMemory(`${f.project}/src/learning_a.md`);
  assert.equal(f.usage(), recorded);
});

test("reads through a symlinked memories dir count under either path", t => {
  const f = gateFixture(t);
  rmSync(`${f.project}/.claude/memories`, { recursive: true });
  mkdirSync(`${f.work}/repo/memories`, { recursive: true });
  symlinkSync(`${f.work}/repo/memories`, `${f.project}/.claude/memories`);
  f.memories("learning_a.md", "learning_b.md");
  f.turn();
  f.readMemory(`${f.work}/repo/memories/learning_a.md`);
  f.readMemory(`${f.project}/.claude/memories/learning_b.md`);
  assert.equal(
    readFileSync(`${f.work}/repo/memories/.usage.tsv`, "utf8"),
    `# since: ${today()}\nlearning_a.md\t${today()}\nlearning_b.md\t${today()}\n`,
  );
});

test("reads during an audit session or a capture turn are not usage", t => {
  const f = gateFixture(t);
  f.memories("learning_a.md");
  f.turn();
  f.skill();
  f.retrieve(["learning_a.md"]);
  assert.equal(existsSync(f.usagePath), false);
  assert.equal(f.lastLog().skip_reason, "memory_skill");
  f.turn();
  f.retrieve(["learning_a.md"]);
  assert.equal(f.usage(), `# since: ${today()}\nlearning_a.md\t${today()}\n`);
  rmSync(f.usagePath);
  f.turn("/memory-audit");
  f.turn("approved");
  f.retrieve(["learning_a.md"]);
  assert.equal(existsSync(f.usagePath), false);
});

test("a retrieval appends to a union-merged file without rewriting it", t => {
  const f = gateFixture(t);
  f.memories("learning_a.md", "learning_c.md");
  const merged =
    "# since: 2026-01-10\nlearning_a.md\t2026-02-01\n# since: 2025-12-01\nlearning_a.md\t2026-03-05\ngarbage line\nlearning_c.md\t2026-01-01";
  writeFileSync(f.usagePath, merged);
  f.turn();
  f.retrieve(["learning_c.md"]);
  assert.equal(f.usage(), `${merged}\nlearning_c.md\t${today()}\n`);
});

test("prompt submit compacts a usage file past its threshold and leaves a small one alone", t => {
  const f = gateFixture(t);
  f.memories("learning_a.md", "learning_b.md", "learning_c.md");
  const small = "# since: 2026-01-10\nlearning_a.md\t2026-02-01\nlearning_a.md\t2026-03-05\n";
  writeFileSync(f.usagePath, small);
  f.turn();
  assert.equal(f.usage(), small);
  const history = Array.from({ length: 60 }, (_, i) => `learning_a.md\t2026-02-${String((i % 28) + 1).padStart(2, "0")}\n`).join("");
  writeFileSync(
    f.usagePath,
    `# since: 2026-01-10\n${history}# since: 2025-12-01\nlearning_gone.md\t2026-03-01\nlearning_b.md\t2999-01-01\ngarbage line\nlearning_c.md\t2026-01-01\n`,
  );
  f.turn();
  assert.equal(f.usage(), "# since: 2025-12-01\nlearning_a.md\t2026-02-28\nlearning_c.md\t2026-01-01\n");
  assert.equal(
    readdirSync(f.state).some(name => name.endsWith(".tmp")),
    false,
  );
});

test("concurrent retrievals record every memory", async t => {
  const f = gateFixture(t);
  const names = Array.from({ length: 12 }, (_, i) => `learning_${String(i).padStart(2, "0")}.md`);
  f.memories(...names);
  f.turn();
  await Promise.all(names.map(name => f.retrieveConcurrently([name])));
  const lines = f.usage().split("\n").filter(Boolean);
  assert.ok(lines.filter(line => line.startsWith("#")).every(line => line === `# since: ${today()}`));
  assert.deepEqual(
    lines.filter(line => !line.startsWith("#")).sort(),
    names.map(name => `${name}\t${today()}`),
  );
});
