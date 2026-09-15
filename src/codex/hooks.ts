import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { begin } from './brief.js';
import { atomic, home, index, locked, Mode, Payload, project, read, readyFile, Session, sessionFile, settings, stateDir, usable, write } from './state.js';
export const REMINDER = `This project keeps a knowledge base of past learnings, decisions, and
debugging discoveries in .claude/memories/, searchable with the Memory Loop query tool.
- If shared project context or a "KB context:" block is already supplied, verify it
  against the code, but do not search the KB again or re-derive it.
- Otherwise, before reading or grepping more than a couple of files, issue ONE
  query for your task: lex terms expected verbatim plus a vec question, an intent
  stating what you want and what to avoid, rerank:false and limit:6. Unlike the
  main thread, do not try keyword variations: no relevant results means move on.
- Snippets are leads, not evidence: get the full document before relying on it.
- Report anything the KB got wrong or left out.`;
export const context = (event: string, text: string) => ({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
function log(root: string, p: Payload, mode: Mode, decision: string, extra = {}): void {
  const file = path.join(stateDir(root), 'gate.log');
  locked(file, () => {
    if (fs.existsSync(file) && fs.statSync(file).size > 524288) atomic(file, fs.readFileSync(file, 'utf8').split('\n').slice(-1000).join('\n') + '\n');
    fs.appendFileSync(file, JSON.stringify({ ts: Date.now(), event: p.hook_event_name, session: p.session_id, mode, decision, ...extra }) + '\n', { mode: 0o600 });
  });
}
const isTool = (name: string, server: string, tool: string) => new RegExp('^mcp__[^ ]*' + server.replaceAll('-', '[-_]') + '__' + tool + '$').test(name);
function sweep(root: string): void {
  for (const dir of [path.join(stateDir(root), 'gate'), path.join(home(), 'memory-loop/tickets')]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if ((name.endsWith('.json') || name.endsWith('.ready')) && Date.now() - fs.statSync(file).mtimeMs > 7 * 86400000) fs.rmSync(file, { force: true });
    }
  }
}
export function hook(p: Payload, bundle: string, indexing = false): unknown {
  const event = p.hook_event_name;
  const root = project(p.cwd);
  const cfg = settings(root);
  if (!cfg.enabled) {
    if (!indexing && ['SessionStart', 'UserPromptSubmit'].includes(event) && !cfg.opt_out)
      return context(event, 'Memory Loop setup is missing. Run memory-loop-setup or scripts/memory-loop setup. Hooks never install dependencies.');
    return;
  }
  if (indexing) { index(root, bundle); return; }
  const mode = cfg.mode;
  const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(path.join(bundle, 'hooks/hooks.json'))).digest('hex');
  const record = (decision: string, extra = {}) => log(root, p, mode, decision, { bundle, hook_hash: fingerprint, ...extra });
  if (['SessionStart', 'PostCompact'].includes(event)) {
    record('instructions');
    return context(event, fs.readFileSync(path.join(bundle, 'instructions/startup.md'), 'utf8') + '\nGate mode: ' + mode);
  }
  const reminder = () => context(event, fs.readFileSync(path.join(bundle, 'instructions/reminder.md'), 'utf8'));
  if (mode === 'off') return event === 'UserPromptSubmit' ? reminder() : undefined;
  const file = sessionFile(root, p.session_id);
  const tool = p.tool_name || '';
  return locked(file, () => {
    let state = read<Session | null>(file, null);
    if (event === 'UserPromptSubmit' && !p.agent_id) {
      if (!p.turn_id) throw new Error('Hook turn identity missing');
      if (!state || state.turn !== p.turn_id) {
        fs.rmSync(readyFile(file), { force: true });
        state = { turn: p.turn_id, queries: 0, denials: [] };
        write(file, state);
      }
      sweep(root);
      record('turn_start', { turn: p.turn_id });
      return reminder();
    }
    if (event === 'SubagentStart') {
      // Child/grandchild turns differ. Read active ROOT context; no batch inference.
      const brief = usable(file, state);
      record(brief ? 'briefed' : 'reminded', { agent: p.agent_id });
      return context(event, brief ? 'Shared project context (parent-curated; not task-specific):\n' + brief + '\nVerify against code; report stale or missing knowledge. Do not re-search supplied context.' : REMINDER);
    }
    if (event === 'PostToolUse' && isTool(tool, 'memory-loop', 'query')) {
      const args = p.tool_input || {};
      const query = typeof args.query === 'string' ? args.query : Array.isArray(args.searches) ? args.searches.map(s => s.query || '').join(' ') : '';
      let response = p.tool_response as any;
      if (typeof response === 'string') { try { response = JSON.parse(response); } catch { response = {}; } }
      if (!query.trim() || response?.isError) return;
      if (state && (p.agent_id || p.turn_id === state.turn)) {
        state.queries++; // Claude semantics: child searches count for current root turn.
        write(file, state);
        record('searched', { queries: state.queries });
      }
      return;
    }
    if (event !== 'PreToolUse') return;
    if (isTool(tool, 'memory-brief', 'prepare_brief')) {
      try {
        const updatedInput = begin(root, p);
        record('preparing');
        return { hookSpecificOutput: { hookEventName: event, permissionDecision: 'allow', updatedInput } };
      } catch (e) { return context(event, 'Brief preparation failed: ' + (e as Error).message); }
    }
    if (!['spawn_agent', 'collaborationspawn_agent', 'collaboration.spawn_agent', 'Agent'].includes(tool)) return;
    if (p.agent_id) { record('nested_exempt'); return; }
    if (!fs.existsSync(path.join(root, '.claude/memories'))) { record('no_collection'); return; }
    if (!state || state.turn !== p.turn_id) throw new Error('No matching root turn; review UserPromptSubmit hook activation');
    if (!Number.isSafeInteger(state.queries) || state.queries < 0 || !Array.isArray(state.denials)) throw new Error('Unreadable gate counters');
    const queries = state.queries;
    if (queries > 0 && usable(file, state)) { record('allow', { queries }); return; }
    const reason = 'Prerequisite missing: search the KB this user turn, retrieve full relevant memories, then call prepare_brief with 1–5 bullets or "none relevant". After it succeeds, retry this spawn. Wait for the previous batch before replacing the shared brief.';
    const same = state.denials.filter(q => q === queries).length;
    let decision: string = mode;
    if (mode === 'enforce') {
      if (state.denials.length >= 8 || same >= 4) decision = state.denials.length >= 8 ? 'escape_turn' : 'escape_no_progress';
      else { state.denials.push(queries); write(file, state); decision = 'deny'; }
    }
    record(decision, { queries, denials_turn: state.denials.length, denials_state: state.denials.filter(q => q === queries).length });
    if (decision === 'deny') return { hookSpecificOutput: { hookEventName: event, permissionDecision: 'deny', permissionDecisionReason: reason } };
    if (mode === 'warn') return context(event, reason);
  });
}
