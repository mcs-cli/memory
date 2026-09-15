/** Preserve unrelated TOML text; journal scalar ownership before each edit. */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { atomic, read, write } from './state.js';
type Value = { present: false } | { present: true; value: any };
interface Record { path: string; keys: string[]; kind: 'toml' | 'json'; before: Value; owned: Value }
export function lookup(data: any, keys: string[]): Value {
  for (const key of keys) { if (!data || typeof data !== 'object' || !(key in data)) return { present: false }; data = data[key]; }
  return { present: true, value: data };
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function keyPath(text: string): string[] {
  let data: any = parse(text + ' = 0');
  const keys: string[] = [];
  while (data && typeof data === 'object') { const key = Object.keys(data)[0]; keys.push(key); data = data[key]; }
  return keys;
}
export function editToml(text: string, keys: string[], value: Value): string {
  const old = lookup(parse(text), keys);
  const lines: string[] = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  let table: string[] = [], found = -1, tableStart = -1, tableEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const header = /^\s*\[([^\[\]\n]+)\]\s*(?:#.*)?\n?$/.exec(lines[i]);
    if (header) {
      if (equal(table, keys.slice(0, -1))) tableEnd = i;
      table = keyPath(header[1]);
      if (equal(table, keys.slice(0, -1))) { tableStart = i; tableEnd = lines.length; }
    } else if (lines[i].includes('=') && !lines[i].trimStart().startsWith('#')) {
      let full;
      try { full = [...table, ...keyPath(lines[i].split('=', 1)[0].trim())]; } catch { continue; }
      if (equal(full, keys)) {
        if (old.present && !['string', 'boolean'].includes(typeof old.value)) throw new Error('Cannot safely edit non-scalar config');
        found = i; break;
      }
    }
  }
  if (old.present && found < 0) throw new Error('Cannot safely edit inline config for ' + keys.join('.') + '; expand it to a TOML table first');
  const assignment = value.present ? JSON.stringify(found >= 0 ? lines[found].split('=', 1)[0].trim().replace(/^"|"$/g, '') : keys.at(-1)) + ' = ' + JSON.stringify(value.value) + '\n' : '';
  // Keep a dotted assignment's original LHS; quoting it would change its meaning.
  if (found >= 0) lines[found] = value.present ? lines[found].split('=', 1)[0].trim() + ' = ' + JSON.stringify(value.value) + '\n' : '';
  else if (value.present) {
    if (tableStart >= 0) lines.splice(tableEnd, 0, assignment);
    else lines.push('\n[' + keys.slice(0, -1).map(k => JSON.stringify(k)).join('.') + ']\n' + assignment);
  }
  const result = lines.join('');
  if (!equal(lookup(parse(result), keys), value)) throw new Error('Config edit did not produce requested value');
  return result;
}
export class Ownership {
  records: Record[];
  constructor(public file: string) { this.records = read(file, []); }
  set(file: string, keys: string[], value: any, kind: 'toml' | 'json' = 'toml'): void {
    file = path.resolve(file);
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const old = lookup(kind === 'toml' ? parse(text) : JSON.parse(text || '{}'), keys);
    const desired: Value = { present: true, value };
    if (equal(old, desired)) return;
    const result = Ownership.render(text, keys, desired, kind);
    let record = this.records.find(r => r.path === file && equal(r.keys, keys));
    if (!record) { record = { path: file, keys, kind, before: old, owned: desired }; this.records.push(record); }
    else if (!equal(old, record.owned)) record.before = old;
    record.owned = desired;
    write(this.file, this.records); // Journal first; cleanup checks whether the write landed.
    atomic(file, result);
  }
  static render(text: string, keys: string[], value: Value, kind: 'toml' | 'json'): string {
    if (kind === 'toml') return editToml(text, keys, value);
    const data = JSON.parse(text || '{}'); let target = data;
    for (const key of keys.slice(0, -1)) target = target[key] ||= {};
    if (value.present) target[keys.at(-1)!] = value.value; else delete target[keys.at(-1)!];
    return JSON.stringify(data, null, 2) + '\n';
  }
  restore(file: string, keys: string[]): void {
    const record = this.records.find(r => r.path === path.resolve(file) && equal(r.keys, keys));
    if (!record) return;
    if (fs.existsSync(record.path)) {
      const text = fs.readFileSync(record.path, 'utf8');
      const data = record.kind === 'toml' ? parse(text) : JSON.parse(text);
      if (equal(lookup(data, keys), record.owned)) atomic(record.path, Ownership.render(text, keys, record.before, record.kind));
      else console.log('Preserved user change: ' + record.path + ' ' + keys.join('.'));
    }
    this.records = this.records.filter(r => r !== record);
    write(this.file, this.records);
  }
  cleanup(): void {
    const retained: Record[] = [];
    for (const r of [...this.records].reverse()) {
      if (!fs.existsSync(r.path)) continue;
      const text = fs.readFileSync(r.path, 'utf8');
      try {
        const data = r.kind === 'toml' ? parse(text) : JSON.parse(text);
        if (equal(lookup(data, r.keys), r.owned)) atomic(r.path, Ownership.render(text, r.keys, r.before, r.kind));
        else console.log('Preserved user change: ' + r.path + ' ' + r.keys.join('.'));
      } catch (e) { console.error('Could not restore ' + r.path + ': ' + (e as Error).message); retained.push(r); }
    }
    this.records = retained.reverse(); write(this.file, this.records);
    if (retained.length) throw new Error('Some settings could not be restored; ownership records retained');
  }
}
