#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { attempt, isDirectory, projectRoot, read } from "./shared.mts";

const MODE: string = "__KB_GATE_MODE__";
const MAX_DENIALS_PER_STATE = 4;
const MAX_DENIALS_PER_TURN = 8;
const LOG_MAX_BYTES = 524288;
const LOG_KEEP_LINES = 1000;
const STATE_MAX_AGE_DAYS = 7;
const KB_MARKER = "KB context:";
const GATED_AGENTS = ["Explore", "general-purpose", "Plan"];

function gate(): void {
  if (MODE === "off") return;
  const payload = JSON.parse(read(0));
  const event = payload.hook_event_name || "";
  const session = String(payload.session_id ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
  const agentId = payload.agent_id || "";
  const agentType = payload.tool_input?.subagent_type || payload.agent_type || "";
  const hadKBBlock = (payload.tool_input?.prompt || "").includes(KB_MARKER);
  if (event === "SubagentStart" && !GATED_AGENTS.includes(agentType)) return;
  if (!["UserPromptSubmit", "PostToolUse", "PreToolUse", "SubagentStart"].includes(event)) return;

  const root = projectRoot();
  const memories = `${root}/.claude/memories`;
  const state = `${root}/.claude/.kb-gate`;
  const log = `${root}/.claude/.kb-gate.log`;
  const turnFile = `${state}/${session}.turn`;
  const queriesFile = `${state}/${session}.queries`;
  const denialsFile = `${state}/${session}.denials`;
  const turnText = (attempt(() => read(turnFile)) ?? "").split("\n")[0]?.trim() ?? "";
  const turn = /^\d+$/.test(turnText) ? Number(turnText) : 0;

  function logEvent(extra: Record<string, unknown>): void {
    attempt(() => appendFileSync(log, `${JSON.stringify({ ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), session, event, mode: MODE, ...extra })}\n`));
  }

  function output(fields: Record<string, string>): void {
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: event, ...fields } })}\n`);
  }

  function sweep(directory: string): void {
    for (const entry of readdirSync(directory)) {
      attempt(() => {
        const path = `${directory}/${entry}`;
        const info = lstatSync(path);
        if (info.isDirectory()) sweep(path);
        else if (info.isFile() && Date.now() - info.mtimeMs >= (STATE_MAX_AGE_DAYS + 1) * 86_400_000) rmSync(path);
      });
    }
  }

  if (event === "UserPromptSubmit") {
    mkdirSync(state, { recursive: true });
    if (turn === 0) attempt(() => sweep(state));
    attempt(() => {
      if (statSync(log).size <= LOG_MAX_BYTES) return;
      const lines = read(log).split("\n");
      if (lines.at(-1) === "") lines.pop();
      writeFileSync(`${state}/log.tmp`, `${lines.slice(-LOG_KEEP_LINES).join("\n")}\n`);
      renameSync(`${state}/log.tmp`, log);
    });
    attempt(() => rmSync(`${state}/log.tmp`, { force: true }));
    attempt(() => writeFileSync(denialsFile, ""));
    attempt(() => writeFileSync(turnFile, `${turn + 1}\n`));
    logEvent({ decision: "turn_start", turn: turn + 1 });
    return;
  }

  if (event === "PostToolUse") {
    const input = payload.tool_input;
    const query = (input?.query || (input?.searches ?? []).map((search: { query?: string }) => search.query ?? "").join(" ")).replace(/\n+$/, "");
    if (!query) return;
    mkdirSync(state, { recursive: true });
    attempt(() => appendFileSync(queriesFile, `${turn}\t${query}\n`));
    logEvent({ decision: "recorded", query });
    return;
  }

  if (event === "SubagentStart") {
    if (!isDirectory(memories)) return;
    output({ additionalContext: `This project keeps a knowledge base of past learnings, decisions, and
debugging discoveries in .claude/memories/, searchable with
mcp__memory-loop__query.

- If your prompt contains a "${KB_MARKER}" block, treat it as established
  ground truth. Verify it against the code, but do NOT search the KB and
  do NOT re-derive it.
- Otherwise, if you are about to read or grep more than a couple of files,
  issue ONE mcp__memory-loop__query for the topic of your task first — a
  lex line of terms you expect verbatim plus a vec line phrased as a
  question, and an intent saying what you want and what to avoid, with
  rerank:false and limit:6. One search is far cheaper than a blind
  file sweep. Unlike the main thread, do not try keyword variations: if
  nothing relevant comes back, move on to the code.
- Snippets are leads, not evidence — they are capped at 300 characters and
  often show only a title. mcp__memory-loop__get a document before relying
  on what it says.
- Report back anything the KB got wrong or left out.` });
    logEvent({ agent_type: agentType, decision: "briefed" });
    return;
  }

  if (agentId) {
    logEvent({ decision: "skip", skip_reason: "nested_subagent" });
    return;
  }
  if (!GATED_AGENTS.includes(agentType)) {
    logEvent({ agent_type: agentType, decision: "skip", skip_reason: "agent_type_not_gated" });
    return;
  }
  if (!isDirectory(memories)) {
    logEvent({ decision: "skip", skip_reason: "no_memories_dir" });
    return;
  }
  const queries = (attempt(() => read(queriesFile)) ?? "").split("\n").filter(line => line && Number(line.split("\t")[0]) === turn).length;
  const freshQuery = queries > 0;
  function logDecision(satisfied: boolean, decision: string, extra = {}): void {
    logEvent({ phase: "discovery", agent_type: agentType, fresh_query: freshQuery, had_kb_block: hadKBBlock, satisfied, decision, ...extra });
  }
  if (freshQuery && hadKBBlock) {
    logDecision(true, "allow");
    return;
  }
  if (MODE === "observe") {
    logDecision(false, "observe");
    return;
  }
  const missing = [
    ...(!freshQuery ? ["no KB search has run since this turn began"] : []),
    ...(!hadKBBlock ? [`the prompt has no "${KB_MARKER}" block`] : []),
  ].join(", and ");

  if (MODE === "enforce") {
    const content = existsSync(denialsFile) ? attempt(() => read(denialsFile)) : "";
    if (content === undefined) {
      logDecision(false, "allow", { skip_reason: "budget_unreadable" });
      return;
    }
    const denials = content.split("\n").map(line => line.split("\t")).filter(fields => Number(fields[0]) === turn && fields[1] === "discovery");
    const denialsTurn = denials.length;
    const denialsState = denials.filter(fields => (Number.parseFloat(fields[2] ?? "") || 0) === queries).length;
    const spent = denialsTurn >= MAX_DENIALS_PER_TURN ? "budget_turn" : denialsState >= MAX_DENIALS_PER_STATE ? "budget_no_progress" : "";
    if (spent) {
      logDecision(false, "allow", { skip_reason: spent, denials_turn: denialsTurn, denials_state: denialsState });
      return;
    }
    attempt(() => appendFileSync(denialsFile, `${turn}\tdiscovery\t${queries}\n`));
    logDecision(false, "deny", { denials_turn: denialsTurn + 1, denials_state: denialsState + 1 });
    output({ permissionDecision: "deny", permissionDecisionReason: `Prerequisite missing: ${missing}. Search the KB with mcp__memory-loop__query first, then re-issue this exact call with a "${KB_MARKER}" block (1-5 bullets of findings, or "${KB_MARKER} none relevant.") at the top of the prompt. Spawning several agents at once: write the findings to a scratchpad file and open each prompt with "${KB_MARKER} see <path>" instead of repeating them. Sub-agents cannot see your KB results — unpasted context is rediscovered from scratch.` });
    return;
  }
  logDecision(false, "warn");
  output({ additionalContext: `KB protocol: ${missing}. Sub-agents cannot see your KB results, so this agent will rediscover from scratch. Before the next spawn, search the KB and open the prompt with a "${KB_MARKER}" block.` });
}

attempt(gate);
