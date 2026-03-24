# Continuous Learning

A [tech pack](https://github.com/mcs-cli/mcs) that gives Claude Code **persistent memory across sessions** — capturing debugging discoveries, architectural decisions, and project conventions into a searchable knowledge base that makes Claude increasingly effective over time.

Built for the [`mcs`](https://github.com/mcs-cli/mcs) configuration engine.

```
identifier: mcs-continuous-learning
requires:   mcs >= 2026.2.28
```

---

## The Problem

Claude Code has no memory between sessions. Every conversation starts from zero — solutions discovered yesterday, architecture decisions made last week, debugging breakthroughs from last month — all gone. You end up re-explaining the same context, re-discovering the same workarounds, and re-making the same decisions.

## The Solution

This pack implements a **closed-loop knowledge system** that captures valuable insights during work and resurfaces them automatically when they're relevant again.

```
                              CONTINUOUS LEARNING LOOP

 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │   SESSION    │     │  KNOWLEDGE   │     │     WORK     │     │   CAPTURE    │
 │    START     │────>│  RETRIEVAL   │────>│   SESSION    │────>│   (save)     │
 └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
        |                    ^                                          |
        |                    |            .claude/memories/             |
        |                    |     ┌──────────────────────────────┐     |
        |                    |     │  learning_swiftui_...        │     |
        |                    |     │  decision_arch_...           │     |
        |                    +-----│  learning_coredata_...       │<----+
        |                          │  decision_testing_...        │
        |                          └──────────────────────────────┘
        |                                        ^
        |                                        |
        |               ┌──────────────────────────────────┐
        |               │       Ollama Embeddings          │
        +──────────────>│       (nomic-embed-text)         │
         background     │       + Semantic Index           │
         re-index on    └──────────────────────────────────┘
         session start
```

---

## How It Works

### The Four Pieces

| Piece | What | How |
|-------|------|-----|
| **Activator Hook** | Triggers evaluation after every prompt | A `UserPromptSubmit` hook reminds Claude to check if the current task produced extractable knowledge |
| **Continuous Learning Skill** | Structures and saves knowledge | A Claude Code skill with extraction rules, quality gates, naming conventions, and ADR-inspired templates |
| **Memory Files** | Persistent storage | Structured markdown files in `.claude/memories/` — version-controlled, human-readable, editable |
| **Semantic Search** | Retrieval at session start | `docs-mcp-server` + Ollama embeddings index memory files and serve them via natural-language search |

### The Feedback Loop

1. **Session starts** — the Ollama status hook detects `.claude/memories/` and re-indexes all memory files into a vector store using `nomic-embed-text` embeddings (runs in the background, doesn't block the session)

2. **Before any task** — a `CLAUDE.local.md` instruction tells Claude to search the knowledge base first (`search_docs` with the project name), surfacing relevant past learnings and decisions

3. **During work** — the activator hook fires on every prompt, reminding Claude to evaluate whether the current interaction produced knowledge worth saving

4. **After valuable work** — the continuous learning skill extracts structured memories, checks for duplicates against the existing KB, and writes them to `.claude/memories/`

5. **Next session** — the new memories are indexed, and the loop continues

Over time, the project accumulates a searchable knowledge base that makes Claude increasingly effective — debugging patterns don't need to be rediscovered, architectural decisions don't need to be re-justified, and conventions don't need to be re-explained.

---

## Memory Types

The system captures two categories of knowledge:

**Learnings** — non-obvious discoveries from debugging and investigation:
```
.claude/memories/learning_swiftui_task_cancellation_on_view_dismiss.md
.claude/memories/learning_core_data_batch_insert_memory_spike.md
.claude/memories/learning_xcode_preview_crash_missing_environment.md
```

Each learning follows a structured template: **Problem > Trigger Conditions > Solution > Verification > Example > Notes > References**.

**Decisions** — deliberate architectural and convention choices:
```
.claude/memories/decision_architecture_mvvm_coordinators.md
.claude/memories/decision_testing_snapshot_strategy.md
.claude/memories/decision_codestyle_naming_conventions.md
```

Decisions use an ADR-inspired template: **Decision > Context > Options Considered > Choice > Consequences > Scope > Examples**.

---

## What's Included

### MCP Servers

| Server | Description |
|--------|-------------|
| **docs-mcp-server** | Semantic search over project memories using local Ollama embeddings |

### Skills

| Skill | Description |
|-------|-------------|
| **continuous-learning** | Extracts learnings and decisions from sessions into structured memory files |

### Session Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| **ollama-status.sh** | `SessionStart` | Checks Ollama health, background-indexes memory files for semantic search |
| **continuous-learning-activator.sh** | `UserPromptSubmit` | Reminds Claude to evaluate knowledge extraction after each prompt |

### Templates (CLAUDE.local.md)

| Section | Instructions |
|---------|-------------|
| **continuous-learning** | Always search the KB before starting any task |

### Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `autoMemoryEnabled` | `false` | Disables built-in memory in favor of the continuous learning system |

---

## Installation

### Prerequisites

- macOS (Apple Silicon or Intel)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- [Ollama](https://ollama.com) — local LLM runtime for embeddings

### Setup

```bash
# 1. Install mcs
brew install mcs-cli/tap/mcs

# 2. Register this tech pack
mcs pack add mcs-cli/memory

# 3. Sync your project
cd ~/Developer/my-project
mcs sync

# 4. Verify everything is healthy
mcs doctor
```

---

## Directory Structure

```
mcs-continuous-learning/
├── techpack.yaml                       # Manifest — defines all components
├── config/
│   └── settings.json                   # Disables built-in auto-memory (autoMemoryEnabled)
├── hooks/
│   ├── ollama-status.sh                # Ollama health + memory re-indexing
│   └── continuous-learning-activator.sh # Knowledge extraction reminder
├── skills/
│   └── continuous-learning/
│       ├── SKILL.md                    # Extraction rules and workflow
│       └── references/
│           └── templates.md            # Learning + Decision memory templates
└── templates/
    └── continuous-learning.md          # "Search KB before any task"
```

---

## You Might Also Be Interested In

| Pack | Description |
|------|-------------|
| [mcs-core-pack](https://github.com/mcs-cli/mcs-core-pack) | Foundational settings, plugins, and git workflows |
| [mcs-ios-pack](https://github.com/mcs-cli/mcs-ios-pack) | Xcode integration, simulator management, and Apple documentation |

---

## Links

- [MCS (My Claude Setup)](https://github.com/mcs-cli/mcs) — the configuration engine
- [Creating Tech Packs](https://github.com/mcs-cli/mcs/blob/main/docs/creating-tech-packs.md) — guide for building your own
- [Tech Pack Schema](https://github.com/mcs-cli/mcs/blob/main/docs/techpack-schema.md) — full YAML reference

---

## License

MIT
