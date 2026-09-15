/** Public arguments are brief only. Hooks replace brief with a single-use ticket.
 * MCP processes have no session identity; guessing one would mix sessions.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { home, locked, Payload, read, readyFile, Session, sessionFile, settings, write } from './state.js';
const PREFIX = 'memory-loop-ticket:';
interface Ticket { root: string; session: string; turn: string; brief: string; created: number }
export function validate(value: unknown): string {
  if (typeof value !== 'string') throw new Error('brief must be a string');
  if ([...value].length > 4000) throw new Error('brief exceeds 4,000 characters; shorten it explicitly (never truncated)');
  const brief = value.trim();
  if (/^(?:KB context:\s*)?none relevant\.?$/i.test(brief)) return brief;
  const lines = brief.split('\n').filter(line => line.trim());
  if (lines.length < 1 || lines.length > 5 || !lines.every(line => /^\s*(?:[-*]|\d+[.)])\s+\S.*$/.test(line)))
    throw new Error('brief must be 1–5 one-line bullets or "none relevant"');
  return brief;
}
/** Hook only. Caller holds the root session lock. */
export function begin(root: string, payload: Payload): { brief: string } {
  const file = sessionFile(root, payload.session_id);
  const state = read<Session | null>(file, null);
  if (!state || state.turn !== payload.turn_id || payload.agent_id) throw new Error('prepare_brief requires the active root user turn');
  // Separate readiness marker makes a failed state write invalidate the old brief.
  fs.rmSync(readyFile(file), { force: true });
  delete state.brief;
  delete state.pending;
  write(file, state);
  const args = payload.tool_input || {};
  if (Object.keys(args).length !== 1 || !('brief' in args)) throw new Error('prepare_brief accepts only brief, never paths or session identifiers');
  const brief = validate(args.brief);
  const token = crypto.randomBytes(32).toString('hex');
  write(path.join(home(), 'memory-loop/tickets', token + '.json'),
    { root, session: payload.session_id, turn: state.turn, brief, created: Date.now() } satisfies Ticket);
  state.pending = token;
  write(file, state);
  return { brief: PREFIX + token };
}
export function prepare(transport: unknown): string {
  if (typeof transport !== 'string' || !/^memory-loop-ticket:[0-9a-f]{64}$/.test(transport))
    throw new Error('No hook-issued preparation ticket. Run setup and review Memory Loop hooks in /hooks.');
  const token = transport.slice(PREFIX.length);
  const ticketPath = path.join(home(), 'memory-loop/tickets', token + '.json');
  const ticket = read<Ticket | null>(ticketPath, null);
  if (!ticket || Date.now() - ticket.created > 300000) throw new Error('Preparation ticket missing or expired; prepare again');
  const file = sessionFile(ticket.root, ticket.session);
  return locked(file, () => {
    try {
      const cfg = settings(ticket.root);
      if (!cfg.enabled || cfg.mode === 'off') throw new Error('Memory Loop briefing is disabled');
      const state = read<Session | null>(file, null);
      if (!state || state.turn !== ticket.turn || state.pending !== token) throw new Error('Preparation superseded or user turn changed; prepare again');
      const brief = validate(ticket.brief);
      delete state.pending;
      state.brief = brief;
      write(file, state);
      write(readyFile(file), { turn: state.turn, token }); // Last write, before acknowledgement.
      return 'Shared project context prepared for this user turn. Wait for this batch to finish before replacing it.';
    } finally { fs.rmSync(ticketPath, { force: true }); }
  });
}
export const TOOL = { name: 'prepare_brief',
  description: 'Prepare shared project context before root delegation this user turn. Search and read full memories first. Supply 1–5 one-line bullets or "none relevant", at most 4,000 characters. Wait for the previous batch before replacing. Requires trusted Memory Loop hooks.',
  inputSchema: { type: 'object', properties: { brief: { type: 'string', maxLength: 4000 } }, required: ['brief'], additionalProperties: false } };
export function handle(request: any): unknown {
  switch (request.method) {
    case 'initialize': return { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'memory-brief', version: '0.1.0' } };
    case 'ping': return {};
    case 'tools/list': return { tools: [TOOL] };
    case 'tools/call':
      try {
        if (request.params?.name !== TOOL.name || Object.keys(request.params.arguments || {}).join() !== 'brief') throw new Error('Only prepare_brief(brief) is supported');
        return { content: [{ type: 'text', text: prepare(request.params.arguments.brief) }] };
      } catch (e) { return { isError: true, content: [{ type: 'text', text: 'Preparation failed: ' + (e as Error).message }] }; }
    default: throw new Error('Method not found');
  }
}
export async function serve(): Promise<void> {
  for await (const line of readline.createInterface({ input: process.stdin })) {
    let request: any;
    try { request = JSON.parse(line); }
    catch { console.log(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })); continue; }
    if (!('id' in request)) continue;
    let response;
    try { response = { result: handle(request) }; }
    catch (e) { response = { error: { code: -32601, message: (e as Error).message } }; }
    console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...response }));
  }
}
