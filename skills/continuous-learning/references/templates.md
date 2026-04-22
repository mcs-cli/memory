# Memory Templates & Examples

Reference file for the continuous-learning skill. Load this when creating or updating memories
to use the appropriate template structure.

## Capture Rules

These apply to **all** templates below. See the [skill's Capture Rules section](../SKILL.md#capture-rules) for the full rationale.

- **Project-specific or a real gotcha.** Save when the knowledge is tied to *this* codebase, **or** when it's a non-obvious language/framework/tool gotcha the project hit through debugging. Skip when the memory reads like reference docs anyone could have looked up.
- **Anonymous.** No personal names, GitHub/Slack handles, or emails anywhere in the memory — not in the problem description, not in examples, not in commit or PR references that expose authorship. Describe the artifact (the bug, the pattern, the decision), not who touched it. Omit the actor; do not invent a role for them.
- **Project pattern, not preference.** Every `decision_` needs evidence it's actually a project pattern: consistent use in the codebase, lint/formatter config, docs, or a team agreement (written *or* verbal — Slack / meeting / session consensus count). If the only support is *"I prefer X,"* skip.

### `Applies to`

Every memory starts with an `Applies to:` line declaring which project(s) it targets. Default: the current project's root directory name. For a memory that genuinely holds across several projects (e.g. a team-wide convention spanning web, iOS, and backend), list them comma-separated:

```
**Applies to:** web-dashboard, ios-app, api-backend
```

Keep content generic enough to stay true in every listed project. If a memory is only partially relevant to one project, save two separate memories — each scoped to the project it actually applies to — rather than one mixed memory.

---

## Staleness Rules

These apply to **all** templates below:

- **No line numbers.** Reference symbols (types, functions, methods) instead — they survive refactors.
- **Prefer module-level paths** over deep file paths. Use full paths only for stable, well-known files.
- **Use semantic anchors** — method signatures, protocol names, and architectural concepts are durable.
- **Omit transient details** — feature flags being removed, in-progress PR numbers, temporary workarounds.

**Good:** `SessionManager.refreshToken(forceExpiry:)` in the `Auth` module
**Bad:** `SessionManager.swift:142` at `Sources/Features/Auth/Session/SessionManager.swift`

---

## Learning Memory Template

```markdown
# Learning: [concise title]

**Applies to:** [project name — or comma-separated list if the memory applies to several projects]

## Problem
[Clear description of the problem]

## Trigger Conditions
[When does this occur? Include exact error messages, symptoms, scenarios]

## Solution
[Step-by-step solution]

## Verification
[How to verify the solution worked]

## Example
[Concrete code example]

## Notes
[Caveats, edge cases, related considerations]

## References
[Links to documentation, articles, resources]
```

### Filled Example

````markdown
# Learning: Background task completion handler must be called before suspension

**Applies to:** my-ios-app

## Problem
App crashes with `0x8badf00d` (watchdog timeout) when a background network request finishes but the completion handler from `beginBackgroundTask` is never called.

## Trigger Conditions
- A network request is kicked off inside `beginBackgroundTask(expirationHandler:)`
- The request completes successfully, but `endBackgroundTask(_:)` is not called on every code path
- Crash appears only when the app is backgrounded during the request — never reproducible in foreground

## Solution
Ensure `endBackgroundTask(_:)` is called on **every** exit path — success, failure, and the expiration handler itself. Use a `defer` block or a single cleanup function to guarantee it.

## Verification
- Background the app during an active network request — no watchdog crash after 30 seconds
- Check Console logs for `"Background task still running"` messages — should not appear

## Example
```swift
var taskID = UIBackgroundTaskIdentifier.invalid
taskID = UIApplication.shared.beginBackgroundTask {
    // Expiration handler — last chance to clean up
    UIApplication.shared.endBackgroundTask(taskID)
    taskID = .invalid
}

performRequest { result in
    defer {
        UIApplication.shared.endBackgroundTask(taskID)
        taskID = .invalid
    }
    // handle result...
}
```

## Notes
- The `0x8badf00d` code is Apple's "ate bad food" watchdog termination — always indicates a timeout
- `beginBackgroundTask` gives ~30 seconds on iOS; the exact duration is not guaranteed
- Multiple background tasks can be active simultaneously — each needs its own identifier and cleanup

## References
- https://developer.apple.com/documentation/uikit/uiapplication/1623031-beginbackgroundtask
````

---

## Decision Memory Template (ADR-Inspired)

Use for architectural decisions, tool choices, or patterns with meaningful trade-offs.

```markdown
# Decision: [concise title]

**Applies to:** [project name — or comma-separated list if the decision applies to several projects]

## Decision
[One-sentence summary of what was decided]

## Context
[Why this decision was needed. What problem or question prompted it?]

## Options Considered
- **Option A**: [Brief description] - [Pros/Cons]
- **Option B**: [Brief description] - [Pros/Cons]

## Choice
[Which option was selected and why]

## Consequences
[What are the implications? What does this enable or prevent?]

## Scope
[Where does this apply? Whole project? Specific modules? Specific scenarios?]

## Examples
[Code examples showing the decision in practice]

## References
[Related documentation, discussions, or resources]
```

### Filled Example

````markdown
# Decision: Repository pattern for data access layer

**Applies to:** my-ios-app

## Decision
All data access (network, local storage, cache) goes through Repository types that expose Combine publishers or async methods — view models never call API clients or databases directly.

## Context
As the app grew, view models were calling network clients, Core Data contexts, and cache layers directly. This made testing difficult and created implicit coupling between UI logic and data sources.

## Options Considered
- **Option A**: Direct access from view models — simple but untestable and tightly coupled
- **Option B**: Service layer — adds an intermediary but doesn't solve the data source abstraction
- **Option C**: Repository pattern — abstracts data source behind a protocol, composable and testable

## Choice
Option C. Repositories own the decision of where data comes from (network vs cache vs local). View models depend on repository protocols, making them easy to test with mock implementations.

## Consequences
- Every new data source requires a repository protocol + implementation
- View models become simpler and fully testable with mock repositories
- Caching strategy is encapsulated — can change without touching UI code

## Scope
All modules. New features must define a repository protocol in the API layer and a concrete implementation in the feature layer.

## Examples
```swift
// Protocol in Interface
protocol UserRepositoryType {
    func user(id: String) -> AnyPublisher<User, Error>
}

// Implementation in Stories
struct UserRepository: UserRepositoryType {
    let apiClient: APIClientType
    let cache: CacheType

    func user(id: String) -> AnyPublisher<User, Error> {
        cache.get(key: id)
            .catch { _ in apiClient.fetchUser(id: id) }
            .eraseToAnyPublisher()
    }
}
```

## References
- Martin Fowler's Repository pattern: https://martinfowler.com/eaaCatalog/repository.html
````

---

## Simplified Decision Template

Use for straightforward, evidence-backed decisions without complex trade-offs. The Rationale must point at real evidence the pattern is the project's — **any** of: the codebase already uses it consistently, lint/formatter config enforces it, a style guide or doc describes it, or the team agreed (written or verbal — Slack, meeting, session consensus). If the only support is *"I prefer X,"* do not save.

```markdown
# Decision: [concise title]

**Applies to:** [project name — or comma-separated list if the decision applies to several projects]

## Decision
[What was decided]

## Rationale
[Why this choice — point at the evidence: codebase usage, lint rule, style guide, config, or team agreement]

## Examples
[How to apply it]
```

### Filled Example

````markdown
# Decision: Use `async let` over `TaskGroup` for fixed-count parallel work

**Applies to:** my-ios-app

## Decision
When running a known, small number of concurrent operations (2-4), use `async let` bindings. Reserve `TaskGroup` for dynamic or unbounded task counts.

## Rationale
- The codebase already uses `async let` consistently for fixed-count concurrency; new code should follow suit.
- Agreed by the iOS team in an architecture review — the type-safety loss from `group.next()` casting was the deciding factor.

## Examples
```swift
// Fixed count — use async let
async let profile = fetchProfile(id)
async let settings = fetchSettings(id)
let (p, s) = await (profile, settings)

// Dynamic count — use TaskGroup
await withTaskGroup(of: Item.self) { group in
    for id in ids {
        group.addTask { await fetchItem(id) }
    }
    // ...
}
```
````
