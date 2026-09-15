#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
import { closeSync, mkdirSync, openSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { attempt, commandExists, isDirectory, projectRoot, read } from "./shared.mts";

const embedModel = "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf";

function syncMemories(): void {
  attempt(() => read(0));
  const root = projectRoot();
  const memories = `${root}/.claude/memories`;
  const directory = `${root}/.claude/.kb-index`;
  const config = `${directory}/memory-loop.yml`;
  if (!commandExists("qmd")) return;
  mkdirSync(directory, { recursive: true });
  const content = `collections:
  memories:
    path: '${memories.replaceAll("'", "''")}'
    pattern: "**/*.md"
models:
  embed: ${embedModel}
  generate: ${embedModel}
  rerank: ${embedModel}
global_context: |
  Project memory KB: this project's own past learnings, decisions and debugging
  discoveries — not external documentation.
`;
  if (attempt(() => read(config)) !== content) {
    const temporary = `${config}.${process.pid}.new`;
    try {
      writeFileSync(temporary, content);
      renameSync(temporary, config);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  if (!isDirectory(memories)) return;

  const lock = `${directory}/.reindex.lock`;
  try {
    mkdirSync(lock);
  } catch {
    const ageMinutes = (Date.now() - statSync(lock).mtimeMs) / 60_000;
    if ((process.platform === "darwin" ? Math.ceil(ageMinutes) : Math.floor(ageMinutes)) <= 5) return;
    rmdirSync(lock);
    mkdirSync(lock);
  }
  try {
    const log = `${directory}/memory-loop.log`;
    const env = { ...process.env, QMD_CONFIG_DIR: directory, INDEX_PATH: `${directory}/memory-loop.sqlite` };
    for (const command of ["update", "embed"]) {
      const fd = openSync(log, command === "update" ? "w" : "a");
      try {
        if (spawnSync("qmd", ["--index", "memory-loop", command], { env, stdio: ["ignore", fd, fd] }).status !== 0) return;
      } finally {
        closeSync(fd);
      }
    }
    const status = spawnSync("qmd", ["--index", "memory-loop", "status"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (status.status !== 0) {
      const reason = status.error?.message ?? status.signal ?? `exit ${status.status}`;
      writeFileSync(log, `qmd status failed (${reason})\n${status.stdout ?? ""}${status.stderr ?? ""}`, { flag: "a" });
      return;
    }
    const pending = status.stdout?.match(/.*Pending: *([0-9]+)/)?.[1] ?? "0";
    if (Number(pending) !== 0) {
      const date = new Date();
      const timestamp = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
      writeFileSync(log, `${timestamp}  ${pending} documents still need embedding after this run.\n`, { flag: "a" });
      return;
    }
    rmSync(log, { force: true });
    spawnSync("qmd", ["--index", "memory-loop", "cleanup"], { env, stdio: "ignore" });
  } finally {
    attempt(() => rmdirSync(lock));
  }
}

attempt(syncMemories);
