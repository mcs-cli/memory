## MANDATORY — Before Starting Any Task

Before writing code, planning, or exploring — **always search the knowledge base first**:

1. **Search the KB** — use `mcp__memory-loop__query`. It searches this project's own `.claude/memories/` — past learnings, debugging discoveries, and architectural decisions from previous sessions, not external documentation. Always pair the two line types — they answer different questions and neither is sufficient alone:

   - `lex` takes **keywords you expect verbatim** in the target memory: identifiers, error names, `"quoted phrases"`, `-negation`. It is the only thing that finds a rare exact token, and it also selects the snippet you get back.
   - `vec` takes **prose**: the question as you would ask a colleague. It is what finds a memory that describes your symptom in different words.
   - `intent` states what you are looking for **and what to avoid**.

   ```
   mcp__memory-loop__query(searches: [{type: "lex", query: "<terms expected verbatim>"},
                                      {type: "vec", query: "<the question, in prose>"}],
                           intent: "<what you want, and what you don't>",
                           rerank: false, limit: 6)
   ```

   Results carry a score of `1/rank`, not a confidence — a poor match still scores 1.00 at the top. If nothing fits, re-query with different terms; raising `limit` only appends a tail and never reorders the results above it.

2. **Retrieve before relying on a result** — a result carries a snippet, which is a lead, not evidence. Fetch what you intend to use with `mcp__memory-loop__multi_get` (or `get` for one document) and read it. Never quote, summarise, or act on a memory you have only seen as a snippet.

   ```
   mcp__memory-loop__get(file: "memories/foo.md")        # or file: "#docid" from a query hit
   mcp__memory-loop__multi_get(pattern: "memories/foo.md,memories/bar.md")
   ```

   The parameters are `file` and `pattern` — not `path`, `docid`, or `paths`. `pattern` also takes a glob (`memories/decision_*.md`) or a comma-separated list of `#docid`s.

Only after completing these steps should you proceed with discovery and implementation.

### When to re-check mid-session

Search the KB again **before starting** whenever the work shifts to a new phase, including but not limited to:
- **Debugging an unexpected failure** — search by topic/domain, not the literal error message; code you can't directly read (generated mocks, codegen output) is the highest-value case to check.
- **Writing or updating tests** — check for testing conventions, patterns, preferred frameworks
- **Refactoring** — check for architectural decisions and code style preferences
- **Error-handling code / validation** — check for established patterns
- **CI/CD or deployment** — check for workflow decisions
- **New integration** — check for conventions on networking, data layer, etc.

Past sessions often contain decisions and patterns that prevent unnecessary iterations and PR comments.

### Delegation in Codex

Use the Memory Loop plugin query/get/multi_get tools (namespaces may be prefixed by the plugin).
In enabled gate modes, every root-level spawn requires a search this user turn and a successful
`prepare_brief(brief)` call. Read full documents, then curate 1–5 one-line bullets of findings
or the explicit statement `none relevant`. Maximum 4,000 characters; oversized input is rejected.
Do not send a storage path or session identifier. Hooks bind the call to the current root turn.
Wait for success before spawning. Further retrieval does not invalidate a prepared brief.

Use sequential batches: wait for all children (and their descendants) in the previous batch to
finish before replacing its brief. The current root brief is injected into children and grandchildren
as shared project context. It is not associated with individual tasks or outgoing prompts.
Nested spawns are exempt from the root gate; subagent searches also count toward the root turn.
Prepare again on each user turn. Modes are enforce, warn, observe, and off; off disables gating
and automatic briefing, so no preparation is required in off mode.

### Capture and audit

After reusable project knowledge emerges, invoke continuous-learning automatically. It alone
writes memories, after deduplication and quality checks. Personal preferences do not qualify.
Environment/tool configuration belongs in a suggested draft for local project instructions.
Only invoke memory-audit when the user requests it; preserve its per-batch approval boundaries.

## Referencing memories in shared artifacts

Memory files are a project-internal KB — filenames drift as files are renamed or merged, and not all readers have repo access. **Never cite memory filenames** in commits, PR descriptions, issue trackers, chat, code comments, docstrings, or release notes — whether or not `.claude/memories/` is tracked in git.

**Summarize the conclusion, don't paste it.** Give the reader the one sentence they need — the trigger, constraint, or choice — sized to the artifact (one line for a commit or code comment; one paragraph for a PR description). If the "why" won't fit, describe the outcome and skip it.

- Bad: `See learning_orm_batch_insert_memory_spike.md`
- Good: `Batches > 500 rows trigger an ORM memory spike — chunk in 250s.`

Memory-to-memory links inside `.claude/memories/` (`Related:`, `References:`) are fine — internal graph, not an external surface.