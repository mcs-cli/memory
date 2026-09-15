import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, join } from "node:path";

export function attempt<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

export function read(path: string | number): string {
  return readFileSync(path, "utf8");
}

export function isDirectory(path: string): boolean {
  return attempt(() => statSync(path).isDirectory()) ?? false;
}

export function commandExists(command: string): boolean {
  return (process.env.PATH ?? "").split(delimiter).some(directory =>
    attempt(() => {
      const path = join(directory, command);
      accessSync(path, constants.X_OK);
      return !statSync(path).isDirectory();
    }) ?? false,
  );
}

export function projectRoot(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.stdout?.replace(/\n+$/, "") || process.env.CLAUDE_PROJECT_DIR || process.env.PWD || process.cwd();
}
