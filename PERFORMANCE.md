# Performance TODOs

Goal: make the app feel consistently smooth by shrinking render scope, isolating hot state, and bounding expensive work.

- [x] Isolate Codex composer state from the diff workspace tree.
  Recommended solution: move the Codex input into its own memoized component so prompt keystrokes do not re-render `CodeChanges`, the diff viewport, or the transcript list.

- [x] Isolate commit draft state from the diff viewport tree.
  Recommended solution: move commit summary and description state into a dedicated commit composer component or store so typing does not re-render `CodeChangesFilesViewport` and diff sections.

- [x] Narrow Jotai subscriptions for Codex sessions.
  Recommended solution: subscribe to per-session atoms or selectors instead of reading the whole `sessionStatesAtom` map so streaming updates only re-render the active session UI that changed.

- [x] Stop forcing transcript scroll on every streamed delta.
  Recommended solution: auto-scroll only when the user is already pinned near the bottom, and batch scroll writes with `requestAnimationFrame`.

- [ ] Memoize or split heavy renderer subtrees behind stable props.
  Recommended solution: make the diff viewport, sidebar, transcript list, and composers independent memoized boundaries so local state changes stay local.

- [ ] Remove unnecessary object and callback churn in hot render paths.
  Recommended solution: stop creating fresh inline objects/functions for large trees on every render, especially around `workingTreeCommitState`, file selection handlers, and viewport props.

- [x] Bound the syntax highlighting cache.
  Recommended solution: replace the unbounded `Map` cache with an LRU cache keyed by stable revision/file identity, not full raw diff text.

- [x] Reduce duplicate diff parsing and projection work.
  Recommended solution: cache parsed diff documents and projected rows per diff payload so unrelated UI updates do not recompute the same structures.

- [ ] Measure render cost before and after each performance change.
  Recommended solution: add React Profiler traces and lightweight timing logs around diff parsing, syntax highlighting, viewport layout, and Codex streaming updates.

- [ ] Add guardrails for large diffs.
  Recommended solution: degrade gracefully for very large files by limiting syntax highlighting, collapsing sections by default, and avoiding eager work outside the visible window.

- [x] Verify Git watch refreshes are not triggering unnecessary full reloads.
  Recommended solution: audit Git watch events and refetch paths so file-system changes refresh only the specific repo state that actually changed.

- [ ] Establish a performance budget for typing responsiveness.
  Recommended solution: define target budgets for input latency, CPU while idle/typing, and memory growth during long sessions, then test against them regularly.

## Direction

Yes: making the app more composable to isolate state changes is the right approach.

The core principle should be: state should live at the lowest level that needs it, and expensive UI should sit behind stable memoized boundaries. In this codebase, the biggest wins will come from preventing keystrokes and streaming session events from invalidating the diff renderer.
