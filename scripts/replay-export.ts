/**
 * Replay a playtest export and print its timeline: inputs, journal and answer lines by game minute.
 * Run: `node scripts/replay-export.ts docs/playtests/<file>.json`.
 */
import { readFileSync } from 'node:fs';
import { replay } from '../src/sim/climb.ts';

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/replay-export.ts <export.json>');
const e = JSON.parse(readFileSync(file, 'utf8'));
const c = replay(e.start, e.inputs);
const saved = JSON.parse(e.state);
const same = JSON.stringify(c.journal) === JSON.stringify(saved.journal);
const hm = (m: number) => {
  const d = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};
console.log(`replay matches saved journal: ${same}; over=${c.over}; minute ${hm(c.minute)}`);
type Row = { at: number; k: string; text: string };
const rows: Row[] = [];
e.inputs.forEach((i: { at: number }, n: number) => {
  const { at, ...rest } = i;
  rows.push({ at, k: `IN${n}`, text: JSON.stringify(rest) });
});
for (const j of c.journal) rows.push({ at: j.at, k: j.story ? 'story' : 'jrnl', text: j.text });
for (const l of c.lines as {
  at?: number;
  minute?: number;
  who?: string;
  text?: string;
  verdict?: string;
  input: number;
}[])
  rows.push({
    at: l.at ?? l.minute ?? 0,
    k: `ans${l.input}`,
    text: `${l.who ?? ''} ${l.verdict ?? ''}: ${l.text ?? ''}`,
  });
rows.sort((a, b) => a.at - b.at);
for (const r of rows) console.log(hm(r.at), r.k.padEnd(6), r.text);
