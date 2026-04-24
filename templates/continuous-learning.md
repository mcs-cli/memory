## MANDATORY — Before Starting Any Task

Before writing code, planning, or exploring — **always search the knowledge base first**:

1. **Search the KB** — use the `docs-mcp-server` tools (`search_docs`) and set the `library` parameter to the name of the current project folder. The library name always matches the root directory name of this project. This server indexes `.claude/memories/` — it contains past learnings, debugging discoveries, and architectural decisions from previous sessions, not external documentation. Try multiple keyword variations if needed.
2. **Read matching memories** — review any relevant results for full context (architecture decisions, gotchas, patterns from past sessions).

Only after completing these steps should you proceed with discovery and implementation.

### When to re-check mid-session

Search the KB again **before starting** whenever the work shifts to a new phase, including but not limited to:
- **Writing or updating tests** — check for testing conventions, patterns, preferred frameworks
- **Refactoring** — check for architectural decisions and code style preferences
- **Error handling / validation** — check for established patterns
- **CI/CD or deployment** — check for workflow decisions
- **New integration** — check for conventions on networking, data layer, etc.

Past sessions often contain decisions and patterns that prevent unnecessary iterations and PR comments.

## Referencing memories in shared artifacts

Memory files are a project-internal KB — filenames drift as files are renamed or merged, and not all readers have repo access. **Never cite memory filenames** in commits, PR descriptions, issue trackers, chat, code comments, docstrings, or release notes — whether or not `.claude/memories/` is tracked in git.

**Summarize the conclusion, don't paste it.** Give the reader the one sentence they need — the trigger, constraint, or choice — sized to the artifact (one line for a commit or code comment; one paragraph for a PR description). If the "why" won't fit, describe the outcome and skip it.

- Bad: `See learning_orm_batch_insert_memory_spike.md`
- Good: `Batches > 500 rows trigger an ORM memory spike — chunk in 250s.`

Memory-to-memory links inside `.claude/memories/` (`Related:`, `References:`) are fine — internal graph, not an external surface.