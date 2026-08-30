## MANDATORY — Before Starting Any Task

Before writing code, planning, or exploring — **always search the knowledge base first**:

1. **Search the KB** — use `mcp__memory-loop__query`. It searches this project's own `.claude/memories/` — past learnings, debugging discoveries, and architectural decisions from previous sessions, not external documentation. Always pair the two line types — they answer different questions and neither is sufficient alone:

   - `lex` takes **keywords**: distinctive identifiers, error names, `"quoted phrases"`, `-negation`. It is the only thing that finds a rare exact token.
   - `vec` takes **prose**: the question as you would ask a colleague. It is what finds a memory that describes your symptom in different words.

   ```
   mcp__memory-loop__query(searches: [{type: "lex", query: "<distinctive terms>"},
                                      {type: "vec", query: "<the question, in prose>"}],
                           intent: "<what you are trying to find out>",
                           rerank: false, limit: 5)
   ```

   Results carry a score of `1/rank`, not a confidence — a poor match still scores 1.00 at the top. Judge the snippets, and try a different phrasing if nothing fits.

2. **Read matching memories** — review any relevant results for full context (architecture decisions, gotchas, patterns from past sessions).

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

### Delegation barrier

`mcp__memory-loop__query` and any sub-agent spawn (the `Agent` / `Task` tool) are **not** independent calls —
the KB result is an *input* to the sub-agent's prompt. Never place them in the same message, and
never spawn a sub-agent before you have read the KB results.

Every sub-agent prompt that reads or searches this codebase must open with:

```
KB context: <1-5 bullets — file paths, patterns, gotchas, decisions from the KB>
```

or the literal line `KB context: none relevant.`

Two rules that save the most work:

- **If the KB already names the files, read them directly.** Do not spawn an agent to re-find
  what a memory already told you. The cheapest outcome is no agent at all.
- **Fanning out to 3+ agents?** Write the findings once to a scratchpad file and point each agent
  at it — but keep the opener, as `KB context: see <path>`. The block is required either way.

## Referencing memories in shared artifacts

Memory files are a project-internal KB — filenames drift as files are renamed or merged, and not all readers have repo access. **Never cite memory filenames** in commits, PR descriptions, issue trackers, chat, code comments, docstrings, or release notes — whether or not `.claude/memories/` is tracked in git.

**Summarize the conclusion, don't paste it.** Give the reader the one sentence they need — the trigger, constraint, or choice — sized to the artifact (one line for a commit or code comment; one paragraph for a PR description). If the "why" won't fit, describe the outcome and skip it.

- Bad: `See learning_orm_batch_insert_memory_spike.md`
- Good: `Batches > 500 rows trigger an ORM memory spike — chunk in 250s.`

Memory-to-memory links inside `.claude/memories/` (`Related:`, `References:`) are fine — internal graph, not an external surface.