#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { attempt, isDirectory, projectRoot, read } from "./shared.mts";

const MODE: string = "__KB_GATE_MODE__";
const MAX_DENIALS_PER_STATE = 4;
const MAX_DENIALS_PER_TURN = 8;
const LOG_MAX_BYTES = 524288;
const LOG_KEEP_LINES = 1000;
const STATE_MAX_AGE_DAYS = 7;
const KB_MARKER = "KB context:";
const GATED_AGENTS = ["Explore", "general-purpose", "Plan"];
const MEMORY_SKILL_SCOPES: Record<string, "turn" | "session"> = { "continuous-learning": "turn", "memory-audit": "session" };
const FILE_WRITE_TOOLS = ["Write", "Edit", "NotebookEdit"];
const MAX_MEMORY_WRITE_DENIALS_PER_TURN = 3;
const MAX_LINKED_NOTES_PER_TURN = 3;
const MEMORY_DELETE = /(?:^|[^\w-])(?:rm|unlink|mv)(?=\s)/;
const MEMORY_PATH = /\.claude\/memories(?![\w.-])|(?:^|[\s'"=])memories\//;
// An allowlist of reads, because a script can write a file in more ways than a denylist could name.
const READ_COMMANDS = new Set(
  "cat head tail less grep egrep rg ugrep ls tree wc stat file diff cmp jq cut tr sort uniq nl column echo printf pwd cd test [ basename dirname realpath readlink shasum md5 sed find".split(
    " ",
  ),
);
const WRITE_FLAGS: Record<string, RegExp> = {
  sed: /^-[a-zA-Z]*i|^--in-place/,
  sort: /^-o|^--output/,
  find: /^-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)$/,
};
const GIT_READS = new Set(["log", "show", "diff", "status", "blame", "grep", "ls-files", "rev-parse", "cat-file"]);
const SLASH_SKILL = new RegExp(`(?:^|[\\s>])/(?:[\\w-]+:)?(${Object.keys(MEMORY_SKILL_SCOPES).join("|")})\\b`, "g");
const RETRIEVAL_TOOLS = ["mcp__memory-loop__get", "mcp__memory-loop__multi_get", "Read"];
// qmd heads every returned document with this line, which is the only place a docid or glob resolves to a file.
const RETRIEVED_RESOURCE = /\[Resource from memory-loop at qmd:\/\/memories\/([^\]\s]+\.md)\]/g;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const USAGE_COMPACT_FLOOR = 50;
const TODAY = new Date().toISOString().slice(0, 10);

function memorySkill(name: unknown): string | undefined {
  const skill =
    String(name ?? "")
      .replace(/^\//, "")
      .split(":")
      .at(-1) ?? "";
  return Object.hasOwn(MEMORY_SKILL_SCOPES, skill) ? skill : undefined;
}

function realPath(path: string): string {
  return attempt(() => realpathSync(path)) ?? join(attempt(() => realpathSync(dirname(path))) ?? dirname(path), basename(path));
}

function mentionsMemories(path: string): boolean {
  const lexical = resolve(path);
  return lexical.includes("memories") || realPath(lexical).includes("memories");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gitSubcommand(args: string[]): string {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === "-C" || arg === "-c") index++;
    else if (!arg.startsWith("-")) return arg;
  }
  return "";
}

function isReadOnly(command: string): boolean {
  if (/\$\(|`|<</.test(command)) return false;
  const plain = command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''").replace(/\d*>&\d+|\d*>\s*\/dev\/null/g, " ");
  if (plain.includes(">")) return false;
  return plain.split(/&&|\|\||[;&|\n]/).every(segment => {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    while (/^\w+=/.test(words[0] ?? "")) words.shift();
    const [name, ...args] = words;
    if (name === undefined) return true;
    if (name === "git") return GIT_READS.has(gitSubcommand(args));
    const flag = WRITE_FLAGS[name];
    return READ_COMMANDS.has(name) && !(flag && args.some(arg => flag.test(arg)));
  });
}

function mentionsDirectory(command: string, directory: string): boolean {
  if (!directory) return false;
  for (let at = command.indexOf(directory); at >= 0; at = command.indexOf(directory, at + 1)) {
    if (!/[\w.-]/.test(command[at + directory.length] ?? "")) return true;
  }
  return false;
}

function readIfExists(file: string): string | undefined {
  return existsSync(file) ? attempt(() => read(file)) : "";
}

function rows(file: string): string[][] | undefined {
  return readIfExists(file)
    ?.split("\n")
    .filter(Boolean)
    .map(line => line.split("\t"));
}

function isMemory(memories: string, name: string): boolean {
  return name.endsWith(".md") && attempt(() => statSync(`${memories}/${name}`).isFile()) === true;
}

function parseUsage(content: string): { since: string; dates: Map<string, string>; lines: number } {
  const dates = new Map<string, string>();
  let since = "";
  const lines = content.split("\n").filter(Boolean);
  for (const [first = "", date, ...rest] of lines.map(line => line.split("\t"))) {
    const header = /^# since: (\S+)$/.exec(first)?.[1];
    if (header && DAY.test(header) && header <= TODAY) {
      if (!since || header < since) since = header;
      continue;
    }
    // A future date would pin a memory as fresh forever, so a skewed clock's row is dropped, not trusted.
    if (!date || rest.length > 0 || !DAY.test(date) || date > TODAY) continue;
    if (date > (dates.get(first) ?? "")) dates.set(first, date);
  }
  return { since, dates, lines: lines.length };
}

function recordRetrievals(usage: string, retrieved: string[]): string[] {
  const content = readIfExists(usage) ?? "";
  const { dates } = parseUsage(content);
  const fresh = retrieved.filter(name => dates.get(name) !== TODAY);
  if (fresh.length === 0) return fresh;
  const header = content ? (content.endsWith("\n") ? "" : "\n") : `# since: ${TODAY}\n`;
  // One append per hook, never a rewrite, so concurrent hooks cannot erase each other's rows.
  appendFileSync(usage, `${header}${fresh.map(name => `${name}\t${TODAY}\n`).join("")}`);
  return fresh;
}

function compactUsage(usage: string, memories: string, state: string): void {
  const content = readIfExists(usage);
  if (!content || content.split("\n").length <= USAGE_COMPACT_FLOOR) return;
  const { since, dates, lines } = parseUsage(content);
  if (lines <= Math.max(USAGE_COMPACT_FLOOR, 2 * dates.size)) return;
  const kept = [...dates.keys()].filter(name => isMemory(memories, name)).sort();
  const compacted = `# since: ${since || TODAY}\n${kept.map(name => `${name}\t${dates.get(name)}\n`).join("")}`;
  // Staged outside memories/ so the shared-memories autopush never stages a half-written temp file.
  const temporary = `${state}/usage.${process.pid}.tmp`;
  try {
    // Rows appended while this ran are carried over; a file rewritten under us is left for the next turn.
    const latest = read(usage);
    if (!latest.startsWith(content)) return;
    writeFileSync(temporary, compacted + latest.slice(content.length));
    renameSync(temporary, usage);
  } finally {
    attempt(() => rmSync(temporary, { force: true }));
  }
}

function gate(): void {
  if (MODE === "off") return;
  const stdin = read(0);
  const payload = JSON.parse(stdin);
  const event = payload.hook_event_name || "";
  const session = String(payload.session_id ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
  const agentId = payload.agent_id || "";
  const agentType = payload.tool_input?.subagent_type || payload.agent_type || "";
  const hadKBBlock = (payload.tool_input?.prompt || "").includes(KB_MARKER);
  if (event === "SubagentStart" && !GATED_AGENTS.includes(agentType)) return;
  if (!["UserPromptSubmit", "PostToolUse", "PreToolUse", "SubagentStart", "SessionStart"].includes(event)) return;
  if (event === "SessionStart" && payload.source !== "compact") return;
  const isSkillCall = event === "PostToolUse" && payload.tool_name === "Skill";
  const toolSkill = isSkillCall ? memorySkill(payload.tool_input?.skill) : undefined;
  if (isSkillCall && !toolSkill) return;
  const isRetrieval = event === "PostToolUse" && RETRIEVAL_TOOLS.includes(payload.tool_name);
  const isFileWrite = event === "PreToolUse" && FILE_WRITE_TOOLS.includes(payload.tool_name);
  const target = payload.tool_input?.file_path || payload.tool_input?.notebook_path || "";
  if (target && !isFileWrite && !mentionsMemories(target)) return;
  const command = String(payload.tool_input?.command ?? "");
  const isBash = event === "PreToolUse" && payload.tool_name === "Bash";
  if (isBash && isReadOnly(command)) return;

  const root = projectRoot();
  const memories = `${root}/.claude/memories`;
  let bashPhase: "memory_write" | "memory_delete" | undefined;
  if (isBash) {
    // The symlink's target is what a command shows once the path was resolved, and it may be named anything.
    const resolved = attempt(() => realpathSync(memories));
    const fromRoot = resolved && relative(attempt(() => realpathSync(root)) ?? root, resolved);
    const touchesMemories =
      MEMORY_PATH.test(command) ||
      (!!resolved && mentionsDirectory(command, resolved)) ||
      (!!fromRoot && !fromRoot.startsWith("..") && mentionsDirectory(command, fromRoot));
    if (!touchesMemories) return;
    bashPhase = MEMORY_DELETE.test(command) ? "memory_delete" : "memory_write";
  }
  const usage = `${memories}/.usage.tsv`;
  const state = `${root}/.claude/.kb-gate`;
  const log = `${root}/.claude/.kb-gate.log`;
  const turnFile = `${state}/${session}.turn`;
  const queriesFile = `${state}/${session}.queries`;
  const denialsFile = `${state}/${session}.denials`;
  const skillsFile = `${state}/${session}.skills`;
  const flaggedFile = `${state}/${session}.flagged`;
  const compactedFile = `${state}/${session}.compacted`;
  const turnText = (attempt(() => read(turnFile)) ?? "").split("\n")[0]?.trim() ?? "";
  const turn = /^\d+$/.test(turnText) ? Number(turnText) : 0;

  function logEvent(extra: Record<string, unknown>): void {
    attempt(() =>
      appendFileSync(
        log,
        `${JSON.stringify({ ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), session, event, mode: MODE, ...extra })}\n`,
      ),
    );
  }

  function output(fields: Record<string, string>): void {
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: event, ...fields } })}\n`);
  }

  function thisTurn(file: string): string[][] | undefined {
    return rows(file)?.filter(([at]) => Number(at) === turn);
  }

  function denials(phase: string): string[][] | undefined {
    return thisTurn(denialsFile)?.filter(fields => fields[1] === phase);
  }

  function append(file: string, fields: (string | number)[]): void {
    attempt(() => {
      mkdirSync(state, { recursive: true });
      appendFileSync(file, `${fields.join("\t")}\n`);
    });
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

  function activeMemorySkill(includeTurnScoped: boolean): string | undefined {
    return rows(skillsFile)?.find(
      ([at, name = ""]) =>
        MEMORY_SKILL_SCOPES[name] === "session" || (includeTurnScoped && MEMORY_SKILL_SCOPES[name] === "turn" && Number(at) === turn),
    )?.[1];
  }

  function under(base: string, path: string): string | undefined {
    const lexical = resolve(root, path);
    const baseReal = attempt(() => realpathSync(base)) ?? base;
    // Either spelling may be the one under the base: a new file has no real path yet, a symlinked base no lexical one.
    return [relative(base, lexical), relative(baseReal, realPath(lexical))].find(
      candidate => candidate && !/^\.\.(?:\/|$)/.test(candidate) && !isAbsolute(candidate),
    );
  }

  function memoryName(path: string): string | undefined {
    return under(memories, path);
  }

  const isMemoryWrite = isFileWrite && memoryName(target) !== undefined;

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
    attempt(() => compactUsage(usage, memories, state));
    attempt(() => writeFileSync(denialsFile, ""));
    attempt(() => writeFileSync(turnFile, `${turn + 1}\n`));
    logEvent({ decision: "turn_start", turn: turn + 1 });
    for (const [, skill = ""] of String(payload.prompt ?? "").matchAll(SLASH_SKILL)) {
      append(skillsFile, [turn + 1, skill]);
      logEvent({ decision: "recorded_skill", skill, source: "prompt" });
    }
    return;
  }

  if (event === "SessionStart") {
    // A row count into the append-only queries file: searches before it were summarized away by the compaction.
    mkdirSync(state, { recursive: true });
    attempt(() => writeFileSync(compactedFile, `${rows(queriesFile)?.length ?? 0}\n`));
    logEvent({ decision: "compacted" });
    return;
  }

  if (toolSkill) {
    append(skillsFile, [turn, toolSkill]);
    logEvent({ decision: "recorded_skill", skill: toolSkill, source: "tool" });
    return;
  }

  if (isRetrieval) {
    if (!isDirectory(memories)) return;
    const names = target ? [memoryName(target)] : [...stdin.matchAll(RETRIEVED_RESOURCE)].map(match => match[1]);
    const retrieved = [...new Set(names)].filter((name): name is string => !!name && isMemory(memories, name));
    if (retrieved.length === 0) return;
    const skill = activeMemorySkill(true);
    if (skill) {
      logEvent({ tool: payload.tool_name, decision: "skip", skip_reason: "memory_skill", skill });
      return;
    }
    const fresh = recordRetrievals(usage, retrieved);
    if (fresh.length > 0) logEvent({ tool: payload.tool_name, decision: "retrieved", files: fresh });
    return;
  }

  if (event === "PostToolUse") {
    const input = payload.tool_input;
    const query = (input?.query || (input?.searches ?? []).map((search: { query?: string }) => search.query ?? "").join(" ")).replace(
      /\n+$/,
      "",
    );
    if (!query) return;
    mkdirSync(state, { recursive: true });
    attempt(() => appendFileSync(queriesFile, `${turn}\t${query}\n`));
    logEvent({ decision: "recorded", query });
    return;
  }

  if (event === "SubagentStart") {
    if (!isDirectory(memories)) return;
    output({
      additionalContext: `This project keeps a knowledge base of past learnings, decisions, and
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
- Report back anything the KB got wrong or left out.`,
    });
    logEvent({ agent_type: agentType, decision: "briefed" });
    return;
  }

  if (isFileWrite && !isMemoryWrite) {
    if (!isDirectory(memories)) return;
    const path = under(root, target);
    if (!path) return;
    const flagged = thisTurn(flaggedFile);
    if (!flagged || flagged.some(([, seen]) => seen === path)) return;
    const name = basename(path).replace(/\.[^.]+$/, "");
    // Memories name types and modules more often than paths. A one-word name like `index` or `utils`
    // turns up in prose everywhere, so only a name of two or more words is distinctive enough to match.
    const distinctive = name.split(/[_.-]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean).length >= 2;
    // Whole paths only: a longer path ending in this one names a different file.
    const byPath = new RegExp(`(?<![\\w./-])(?:\\./)?${escapeRegExp(path)}(?![\\w/-]|\\.\\w)`);
    const byName = new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`);
    const matches = readdirSync(memories)
      .filter(file => isMemory(memories, file))
      .map(file => {
        const text = attempt(() => read(`${memories}/${file}`)) ?? "";
        const viaPath = text.includes(path) && byPath.test(text);
        return { file, viaPath, hit: viaPath || (distinctive && text.includes(name) && byName.test(text)) };
      })
      .filter(({ hit }) => hit);
    if (matches.length === 0) return;
    const hits = matches.map(({ file }) => file);
    const term = matches.some(({ viaPath }) => viaPath) ? path : name;
    function logLinked(decision: string, extra = {}): void {
      logEvent({
        phase: "linked_edit",
        tool: payload.tool_name,
        target: path,
        term,
        agent_type: agentType,
        decision,
        files: hits,
        ...extra,
      });
    }
    // Any search since the last compaction counts: its results are still in context, whichever turn ran it.
    const compactedAt = Number(attempt(() => read(compactedFile).trim())) || 0;
    const searches = (rows(queriesFile) ?? []).slice(compactedAt).map(([, ...query]) => query.join("\t").toLowerCase());
    const searched = [...new Set([term, ...(distinctive ? [name] : [])])].map(text => text.toLowerCase());
    if (searches.some(query => searched.some(text => query.includes(text)))) {
      logLinked("allow", { skip_reason: "linked_searched" });
      return;
    }
    if (flagged.length >= MAX_LINKED_NOTES_PER_TURN) {
      logLinked("allow", { skip_reason: "linked_cap" });
      return;
    }
    append(flaggedFile, [turn, path]);
    logLinked(MODE === "observe" ? "observe" : "warn");
    if (MODE === "observe") return;
    output({
      additionalContext: `${hits.length === 1 ? "A memory mentions" : `${hits.length} memories mention`} ${term}, and the KB has not been searched for it since the session began or was last compacted. This edit was applied without them: search the KB with a lex line for "${term}" and a vec line saying what this edit changes and why, retrieve the relevant results with mcp__memory-loop__get, and check the edit against them.`,
    });
    return;
  }

  if (isMemoryWrite || bashPhase) {
    const phase = bashPhase ?? "memory_write";
    const subject = isMemoryWrite ? realPath(resolve(root, target)) : command.slice(0, 200);
    function logMemory(decision: string, extra = {}): void {
      logEvent({ phase, tool: payload.tool_name, target: subject, agent_type: agentType, decision, ...extra });
    }
    if (agentId) {
      logMemory("deny", { skip_reason: "subagent" });
      output({
        permissionDecision: "deny",
        permissionDecisionReason:
          "Sub-agents cannot change .claude/memories/. Report the proposed memory change back instead; the main thread applies it through the continuous-learning or memory-audit skill, which run the search, pre-write and approval checks.",
      });
      return;
    }
    // A Bash write has no single target and bypasses the skill's Edit-based checks, so no skill authorizes it.
    const skill = bashPhase === "memory_write" ? undefined : activeMemorySkill(isMemoryWrite);
    if (skill) {
      logMemory("allow", { skill });
      return;
    }
    const spent = denials(phase);
    if (spent === undefined) {
      logMemory("allow", { skip_reason: "budget_unreadable" });
      return;
    }
    if (spent.length >= MAX_MEMORY_WRITE_DENIALS_PER_TURN) {
      logMemory("allow", { skip_reason: "budget_turn", denials_turn: spent.length });
      return;
    }
    append(denialsFile, [turn, phase]);
    logMemory("deny", { denials_turn: spent.length + 1 });
    output({
      permissionDecision: "deny",
      permissionDecisionReason: isMemoryWrite
        ? "Memory files are written only through the continuous-learning or memory-audit skill, and continuous-learning has not been invoked in this turn. Invoke Skill(continuous-learning) now and run its search and pre-write checks before retrying. Working from a copy loaded in an earlier turn is what skips them."
        : bashPhase === "memory_write"
          ? "Memory files are changed only with Edit or Write, through Skill(continuous-learning) or Skill(memory-audit); a Bash command that may write to .claude/memories/ is denied even when one of them is active. If this command only reads, use the Read tool, or a plain read command (cat, head, grep, ls, sed -n, find, jq, read-only git) with no redirect, heredoc or command substitution."
          : "Memory files are deleted or moved only by the memory-audit skill, after the user approves the batch. Run Skill(memory-audit) and follow its approval step before retrying; to correct a memory instead, edit it through Skill(continuous-learning).",
    });
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
  const queries = thisTurn(queriesFile)?.length ?? 0;
  const freshQuery = queries > 0;
  function logDecision(satisfied: boolean, decision: string, extra = {}): void {
    logEvent({
      phase: "discovery",
      agent_type: agentType,
      fresh_query: freshQuery,
      had_kb_block: hadKBBlock,
      satisfied,
      decision,
      ...extra,
    });
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
    const discovery = denials("discovery");
    if (discovery === undefined) {
      logDecision(false, "allow", { skip_reason: "budget_unreadable" });
      return;
    }
    const denialsTurn = discovery.length;
    const denialsState = discovery.filter(fields => (Number.parseFloat(fields[2] ?? "") || 0) === queries).length;
    const spent = denialsTurn >= MAX_DENIALS_PER_TURN ? "budget_turn" : denialsState >= MAX_DENIALS_PER_STATE ? "budget_no_progress" : "";
    if (spent) {
      logDecision(false, "allow", { skip_reason: spent, denials_turn: denialsTurn, denials_state: denialsState });
      return;
    }
    append(denialsFile, [turn, "discovery", queries]);
    logDecision(false, "deny", { denials_turn: denialsTurn + 1, denials_state: denialsState + 1 });
    output({
      permissionDecision: "deny",
      permissionDecisionReason: `Prerequisite missing: ${missing}. Search the KB with mcp__memory-loop__query first, then re-issue this exact call with a "${KB_MARKER}" block (1-5 bullets of findings, or "${KB_MARKER} none relevant.") at the top of the prompt. Spawning several agents at once: write the findings to a scratchpad file and open each prompt with "${KB_MARKER} see <path>" instead of repeating them. Sub-agents cannot see your KB results — unpasted context is rediscovered from scratch.`,
    });
    return;
  }
  logDecision(false, "warn");
  output({
    additionalContext: `KB protocol: ${missing}. Sub-agents cannot see your KB results, so this agent will rediscover from scratch. Before the next spawn, search the KB and open the prompt with a "${KB_MARKER}" block.`,
  });
}

attempt(gate);
