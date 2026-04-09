# Memory Templates & Examples

Reference file for the continuous-learning skill. Load this when creating or updating memories
to use the appropriate template structure.

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

```markdown
# Learning: Background task completion handler must be called before suspension

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
```

---

## Decision Memory Template (ADR-Inspired)

Use for architectural decisions, tool choices, or patterns with meaningful trade-offs.

```markdown
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

```markdown
# Decision: Repository pattern for data access layer

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
```

---

## Simplified Decision Template

Use for straightforward preferences without complex trade-offs.

```markdown
## Decision
[What was decided]

## Rationale
[Why this choice]

## Examples
[How to apply it]
```

### Filled Example

```markdown
# Decision: Use `async let` over `TaskGroup` for fixed-count parallel work

## Decision
When running a known, small number of concurrent operations (2-4), prefer `async let` bindings over `TaskGroup`.

## Rationale
- `async let` reads more naturally and avoids the boilerplate of creating a group, adding tasks, and collecting results
- Type safety is preserved without casting from `group.next()`
- `TaskGroup` is the right choice when the number of tasks is dynamic or large

## Examples
```swift
// Preferred: fixed concurrency with async let
async let profile = fetchProfile(id)
async let settings = fetchSettings(id)
let (p, s) = await (profile, settings)

// Use TaskGroup when count is dynamic
await withTaskGroup(of: Item.self) { group in
    for id in ids {
        group.addTask { await fetchItem(id) }
    }
    // ...
}
```
```
