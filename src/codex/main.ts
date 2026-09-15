import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { context, hook, REMINDER } from './hooks.js';
import { serve } from './brief.js';
import { dependencies, ignore, manage, modelFile } from './manage.js';
import { environment, index, project, settings } from './state.js';
async function main(): Promise<void> {
  const bundle = path.resolve(__dirname, '..');
  const action = process.argv[2];
  if (action === 'hook') {
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(0, 'utf8'));
      const root = project(payload.cwd);
      if (payload.hook_event_name === 'SessionStart' && settings(root).enabled) ignore(root);
      const result = hook(payload, bundle, process.argv.includes('--index'));
      if (result) console.log(JSON.stringify(result));
    } catch (e) {
      console.error('Memory Loop hook failed open: ' + (e as Error).message);
      if (payload?.hook_event_name === 'SubagentStart') {
        try { const cfg = settings(project(payload.cwd)); if (cfg.enabled && cfg.mode !== 'off') console.log(JSON.stringify(context('SubagentStart', REMINDER))); } catch { /* fail open */ }
      }
    }
  } else if (action === 'brief-mcp') await serve();
  else if (action === 'qmd-mcp') {
    const root = project();
    if (!settings(root).enabled) throw new Error('Memory Loop setup missing or project disabled. Run memory-loop setup.');
    const missing = dependencies();
    if (!fs.existsSync(modelFile())) missing.push('Shared Qwen3 model missing');
    if (missing.length) throw new Error(missing.join('; ') + '. Run Memory Loop setup.');
    index(root, bundle, true); // qmd reads its configuration only after publication.
    const child = spawn('qmd', ['--index', 'memory-loop', 'mcp'], { stdio: 'inherit', env: environment(root) });
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => child.kill(signal));
    child.on('error', e => { console.error(e.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  } else process.exitCode = await manage(process.argv.slice(2), bundle);
}
main().catch(e => { console.error('Memory Loop: ' + e.message); process.exitCode = 1; });
