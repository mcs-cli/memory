# Execution Mechanics

Ordering and technique rules for Step 4, once a batch has been approved. Each one corresponds to a way
a real audit has corrupted the KB it was cleaning. Add new lessons here rather than to the criteria
sections of `SKILL.md` — the criteria are the skill's spine and stay short enough to read as criteria.

## Applying the edits

1. **Never leave a broken link behind, not even between two steps.** Find the referrers first with
   `grep -rl '<memory-name>' <memories-dir>`. To rename: copy to the new name, repoint every referrer,
   *then* delete the old file. In that order the KB is consistent after each step, so an interrupted
   audit leaves a duplicate at worst, never a dangling pointer. `mv` cannot give you that — it breaks
   inbound links the moment it runs, while repointing first writes links to a name that does not exist
   yet. To delete: repair the referrers before removing the file.

2. **What replaces an inbound pointer depends on why the memory was dropped.** Only the first case
   calls for inlining anything:
   - **Falsified (category I)** — write the corrected fact into the referrer. It then carries what the
     code actually does, which is more useful than the dead pointer was, and it preserves the verified
     half of the memory being removed.
   - **Superseded or duplicated (A, H)** — repoint at the surviving memory. Do not copy content across.
   - **Dropped as valueless (B–G)** — delete the pointer. There is no fact to salvage, and inlining
     content from a memory just judged not worth keeping quietly undoes that decision.

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
