# Execution Mechanics

Ordering and technique rules for Step 4, once a batch has been approved. Each one corresponds to a way
a real audit has corrupted the KB it was cleaning. Add new lessons here rather than to the criteria
sections of `SKILL.md` — the criteria are the skill's spine and stay short enough to read as criteria.

## Applying the edits

1. **Repair inbound links *before* deleting, and rename *before* repointing.** Find referrers with
   `grep -rl '<memory-name>' <memories-dir>` first. A rename invalidates any link you just wrote at
   the old name, so when a batch contains both a rename and a repoint, do the rename first. The KB
   should be consistent after every step, not only at the end.

2. **Replace a dropped memory's inbound pointer with the corrected fact inline** — don't just delete
   the bullet. The referrer then carries what the code actually does, which is strictly more useful
   than the dead pointer was, and it preserves the verified half of the memory being removed.

3. **Verify the symbols in the parts you KEEP, not just the parts you cut.** When trimming a memory it
   is natural to fact-check the claims being deleted and trust the ones being carried forward — which
   is how an audit propagates a reference to a symbol that never existed.

4. **Close with a KB-wide link scan, and confirm a clean result a second way.** Walk every memory —
   not just the touched files — and assert each `learning_*` / `decision_*` reference resolves to an
   existing file. A scan can report a false clean (a pipeline that swallows its input, a wrong cwd),
   so when "0 problems" comes back suspiciously easily, re-run it by a different method before
   trusting it.

## If you delegate the legwork

Fanning batches out to subagents for reading and fact-checking works well, with one caveat. Agents are
reliable on "does this file/symbol exist" and on code they have actually opened, and **unreliable on
negative claims at scale** — "X appears nowhere", "only two call sites remain", "that snippet is
fabricated". Such claims were wrong repeatedly in practice, and they skewed consistently toward
deleting more, which compounds a skill that already leans DROP-aggressive.

So: **the orchestrator re-verifies every negative claim that drives a DROP**, with a command whose
output it saw. Require agents to state exactly what they ran, and to say PARTIAL rather than guess.
Verdicts remain the orchestrator's; agents supply evidence.
