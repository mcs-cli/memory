#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = ["skills/continuous-learning/SKILL.md", "skills/memory-audit/SKILL.md", "SYNC-BLOCKS.md"];
for (const tag of ["capture-rules", "strip-the-anchors", "applies-to"]) {
  const blocks = files.map(file => {
    const lines: string[] = [];
    let inside = false;
    for (const line of readFileSync(`${root}/${file}`, "utf8").split("\n")) {
      if (line.includes(`<!-- SYNC:${tag} -->`)) inside = true;
      if (inside) lines.push(line);
      if (line.includes("<!-- /SYNC -->")) inside = false;
    }
    const block = lines.join("\n");
    if (!block) console.error(`MISSING: block '${tag}' not found in ${file}`);
    return block;
  });
  if (blocks.every(block => block && block === blocks[0])) console.log(`OK: ${tag} identical across all three files`);
  else {
    console.error(`DRIFT: ${tag} — update SYNC-BLOCKS.md and copy it into both skills.`);
    process.exitCode = 1;
  }
}
