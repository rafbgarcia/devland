# GitHub Desktop Diff Viewer Implementation Phases

This plan tracks the work required to implement GitHub Desktop-style file diff behavior in Devland.

Agreed decisions:

- GitHub Desktop parity for syntax highlighting now.
- PR diff comments should create draft review threads first, then submit later as part of the review flow.
- Code view comments should always route to the current active `CodeTarget` Codex app-server session.

Core design rule:

- Share one diff domain and rendering engine across Code view, PR diff view, and AI review excerpts.
- Do not share one giant feature component. Keep separate feature shells for Code and PR flows, but make them consume the same parsed diff model, token pipeline, row projection, selection model, and comment-anchor mapping.

Reference codebases:

- Devland repo: `/Users/rafa/github.com/rafbgarcia/devland`
- GitHub Desktop repo: `/Users/rafa/github.com/desktop/desktop`

Key GitHub Desktop references:

- Unified diff parser: `/Users/rafa/github.com/desktop/desktop/app/src/lib/diff-parser.ts`
- Diff line model: `/Users/rafa/github.com/desktop/desktop/app/src/models/diff/diff-line.ts`
- Diff selection model: `/Users/rafa/github.com/desktop/desktop/app/src/models/diff/diff-selection.ts`
- Syntax highlighting pipeline: `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/syntax-highlighting/index.ts`
- Highlighter worker types: `/Users/rafa/github.com/desktop/desktop/app/src/lib/highlighter/types.ts`
- Intra-line diff tokens: `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/diff-helpers.tsx`
- Side-by-side row projection and modified-line pairing: `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/side-by-side-diff.tsx`
- Partial patch formatting: `/Users/rafa/github.com/desktop/desktop/app/src/lib/patch-formatter.ts`
- Syntax highlighting design notes: `/Users/rafa/github.com/desktop/desktop/docs/technical/syntax-highlighting.md`

Current Devland surfaces to replace or refactor:

- Raw diff parser: `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/lib/code-diff.ts`
- Diff row renderer: `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/code-diff-viewer.tsx`
- Shared files viewport: `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/code-changes-files-viewport.tsx`
- Code diff data hooks: `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/hooks/use-git-code-changes.ts`
- PR diff data hook: `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/hooks/use-pr-diff-data.ts`
- AI review overlay excerpts: `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/pr-review-overlay.tsx`
- Git diff IPC/main-process helpers: `/Users/rafa/github.com/rafbgarcia/devland/src/main-process/git.ts`

## Phase 1: Build a real diff domain model

- [ ] Replace the current string-to-flat-row parser with a structured diff model.

High-level intent:

- Create a proper shared diff domain for text diffs: `DiffDocument -> DiffFile -> DiffHunk -> DiffLine`.
- Preserve the metadata needed for exact behavior: hunk headers, original diff line numbers, old/new line numbers, no-trailing-newline markers, file status, and line selectability.
- Keep the parser and models renderer-agnostic.

What to look at first:

- GitHub Desktop parser and line model:
  - `/Users/rafa/github.com/desktop/desktop/app/src/lib/diff-parser.ts`
  - `/Users/rafa/github.com/desktop/desktop/app/src/models/diff/diff-line.ts`
- Current Devland parser:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/lib/code-diff.ts`

Suggested outputs:

- New diff model types under a dedicated renderer-neutral area such as `src/renderer/lib/diff/` or `src/lib/diff/`.
- A parser that can return file-level and hunk-level structures from unified diff text.
- Support for text-only first, but define explicit file kinds so binary/image/large-file handling can be added without changing the model shape.

Acceptance criteria:

- The parser no longer throws away hunk headers.
- Each changed line has stable original diff positioning metadata.
- The old `parseDiff` flat-row API is either removed or rewritten as a projection on top of the new model.

## Phase 2: Add diff row projection for rendering

- [ ] Introduce a shared row projection layer that turns structured hunks into renderable rows.

High-level intent:

- Keep parsing separate from rendering.
- Add one projection step that produces the rows needed by the UI for side-by-side and excerpt rendering.
- Match GitHub Desktop behavior for grouping modified chunks and pairing added/deleted lines.

What to look at first:

- GitHub Desktop row shaping and modified pairing:
  - `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/side-by-side-diff.tsx`
  - `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/diff-helpers.tsx`
- Current Devland rendering path:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/code-diff-viewer.tsx`
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/code-changes-files-viewport.tsx`

Suggested outputs:

- A shared `projectDiffRows(...)` function or equivalent.
- Row types that support:
  - hunk rows
  - context rows
  - added rows
  - deleted rows
  - modified paired rows
- Modified-row pairing logic aligned with GitHub Desktop behavior:
  - only pair for intra-line diff visualization when the modified chunk has equal add/delete counts
  - avoid intra-line diffing for very long lines

Acceptance criteria:

- The UI no longer renders directly from raw diff lines.
- The same projected row model can feed Code view, PR view, and review excerpts.

## Phase 3: Implement GitHub Desktop-parity syntax highlighting

- [ ] Build the syntax-highlighting pipeline from actual before/after file contents.

High-level intent:

- Do not syntax-highlight diff lines in isolation.
- Load real old/new file contents, tokenize them, then stitch the tokens back onto projected diff rows.
- Match GitHub Desktop’s approach closely enough that syntax highlighting parity is real, not approximate.

What to look at first:

- GitHub Desktop syntax highlighting:
  - `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/syntax-highlighting/index.ts`
  - `/Users/rafa/github.com/desktop/desktop/app/src/lib/highlighter/types.ts`
  - `/Users/rafa/github.com/desktop/desktop/app/src/lib/highlighter/worker.ts`
  - `/Users/rafa/github.com/desktop/desktop/app/src/highlighter/index.ts`
  - `/Users/rafa/github.com/desktop/desktop/docs/technical/syntax-highlighting.md`
- Current Devland dependencies:
  - `/Users/rafa/github.com/rafbgarcia/devland/package.json`

Implementation notes:

- Since parity is required now, it is acceptable to adopt a CodeMirror-5-based highlighting pipeline similar to GitHub Desktop for this phase.
- Keep the token provider behind a small interface so the renderer does not hard-code the tokenization engine.
- The provider must work for both working tree diffs and historical/PR diffs.
- Cap file-content loading similarly to GitHub Desktop to avoid pathological files blocking the UI.

Acceptance criteria:

- Syntax highlighting uses real file contents from old/new revisions.
- Tokens are attached to projected rows instead of raw diff text.
- Highlighting works in Code view, PR diff view, and excerpt rendering where applicable.

## Phase 4: Add intra-line diff highlighting

- [ ] Implement precise changed-substring highlighting inside modified rows.

High-level intent:

- Add GitHub Desktop-style inner diff highlighting such as the red-highlighted single-character change in the screenshot.
- Keep intra-line diff tokens separate from syntax tokens, then merge them at render time.

What to look at first:

- GitHub Desktop changed-range logic:
  - `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/changed-range.ts`
  - `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/diff-helpers.tsx`
  - `/Users/rafa/github.com/desktop/desktop/app/src/ui/diff/side-by-side-diff.tsx`

Suggested outputs:

- A reusable `getIntraLineDiffTokens(before, after)` helper.
- Render logic that composes syntax tokens and diff-inner tokens.
- Styling tokens/classes for add-inner and delete-inner states.

Acceptance criteria:

- Modified paired rows show accurate substring highlighting.
- The behavior matches GitHub Desktop’s chunk-pairing rules rather than trying to diff every nearby line opportunistically.

## Phase 5: Refactor the shared diff viewport around the new engine

- [ ] Rebuild the shared diff viewport to consume the new diff engine rather than raw strings.

High-level intent:

- Preserve the good part of the current architecture: Code and PR features already share a lower-level viewport.
- Replace the low-fidelity internals with the new diff document, row projection, syntax tokens, and intra-line diff tokens.

What to look at first:

- Current Devland shared viewport:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/code-changes-files-viewport.tsx`
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/pr-diff-viewport.tsx`

Implementation notes:

- Keep separate feature shells:
  - Code shell for local changes/history
  - PR shell for commit/all-changes browsing
- Share a `DiffFilesViewport` and row renderer beneath them.
- If virtualization assumptions need to change because rows can become richer, do that now rather than layering hacks on the old assumptions.

Acceptance criteria:

- Code and PR diff surfaces both use the same new engine and shared viewport internals.
- The old `DiffRow` and direct `parseDiff(file.rawDiff)` path are gone.

## Phase 6: Implement line selection for partial commits in Code view

- [ ] Add GitHub Desktop-style line inclusion state and partial patch generation for Code view.

High-level intent:

- This phase applies only to local working-tree Code view, not PR review.
- Build a real immutable selection model and patch formatter instead of ad hoc checkbox state.

What to look at first:

- GitHub Desktop selection and patch formatting:
  - `/Users/rafa/github.com/desktop/desktop/app/src/models/diff/diff-selection.ts`
  - `/Users/rafa/github.com/desktop/desktop/app/src/lib/patch-formatter.ts`
- Devland git main-process helpers:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/main-process/git.ts`

Implementation notes:

- Restrict selection to includeable lines only.
- Preserve whole-file, partial, and none-selected states.
- Add main-process support for applying a partial patch to the index in a production-safe way.
- Be careful with new files, deleted files, renamed files, and mixed staged/unstaged states.

Acceptance criteria:

- Users can select individual lines or hunk groups for inclusion in a commit.
- The selection state can be transformed into a valid patch and applied correctly.
- Code view selection logic is not reused in PR review mode.

## Phase 7: Add normalized comment anchors

- [ ] Define one shared comment-anchor model for diff lines and ranges.

High-level intent:

- The renderer should not know whether a comment goes to Codex or GitHub.
- The viewer should emit normalized anchors that both backends can consume.

Suggested anchor shape:

- file path
- side (`old` or `new`)
- line number
- optional range
- hunk identity or original diff position where needed
- commit/base/head context where needed for PR review comments

What to look at first:

- New diff model from phases 1 and 2
- PR diff hook:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/hooks/use-pr-diff-data.ts`
- Code workspace shell:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/code-workspace-view.tsx`

Acceptance criteria:

- Comment UI can target exact diff lines or valid ranges using stable anchor data from the shared engine.
- Anchor generation does not depend on scraping DOM state.

## Phase 8: Implement Code view comments routed to the active Codex session

- [ ] Add Code view inline comments that always go to the current active `CodeTarget` Codex app-server session.

High-level intent:

- These are not GitHub review comments.
- They are anchored follow-up prompts sent into the currently active Codex session for the current CodeTarget.
- The anchor should be included as structured context in the message payload or prompt envelope so Codex can understand exactly what line/range the user is referring to.

What to look at first:

- Code workspace and session actions:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/code-workspace-view.tsx`
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/hooks/use-codex-sessions.ts`
  - `/Users/rafa/github.com/rafbgarcia/devland/src/main-process/codex-app-server.ts`

Implementation notes:

- The active CodeTarget is the source of truth.
- If there is no session yet for the current target, decide whether to create one automatically or block with a clear UX; if there is ambiguity, stop and decide before implementing.
- Keep the transport format explicit. Do not just append line numbers to free text and hope it is enough.

Acceptance criteria:

- Commenting from Code view always targets the active CodeTarget session.
- Anchored comment context is transmitted in a structured and debuggable form.

## Phase 9: Implement PR review draft threads through `gh api graphql`

- [ ] Add PR diff inline comments as draft review threads backed by GitHub review APIs.

High-level intent:

- Do not use `gh pr comment` for line comments.
- Use `gh api graphql` in the main process to create draft review comments/threads against the PR diff.
- Keep draft state explicit so multiple comments can accumulate before the review is submitted.

What to look at first:

- Main-process GitHub integrations:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/main-process/gh-cli.ts`
  - `/Users/rafa/github.com/rafbgarcia/devland/src/main-process/gh-graphql.ts`
  - `/Users/rafa/github.com/rafbgarcia/devland/src/main-process/ipc.ts`
- PR review shell:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/pr-review-dialog.tsx`
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/pr-code-changes.tsx`

Implementation notes:

- The backend should manage:
  - finding or creating the pending review
  - creating draft review threads/comments with exact diff anchors
  - submitting the review later
- Keep the renderer/backend separation strict. The UI should hand off normalized anchors and comment text only.

Acceptance criteria:

- Users can create draft inline review comments from the PR diff view.
- Draft comments remain in review state until explicit submission.
- The implementation uses `gh api graphql`, not browser automation or PR-level comment commands.

## Phase 10: Rebuild AI review excerpts on top of the shared diff engine

- [ ] Replace the ad hoc AI review diff excerpts with shared diff-engine excerpts.

High-level intent:

- The AI review overlay should not parse raw diff strings separately.
- It should request excerpt rows from the shared diff engine, preserving syntax highlighting and accurate line anchoring.

What to look at first:

- Current ad hoc excerpt logic:
  - `/Users/rafa/github.com/rafbgarcia/devland/src/renderer/components/pr-review-overlay.tsx`

Implementation notes:

- Reuse the same projected row types used by the main diff surfaces.
- Excerpt filtering should be aware of old/new line identity and hunk context, not just `newLineNumber ?? oldLineNumber`.

Acceptance criteria:

- Review excerpts render through the shared engine.
- Excerpts stay visually and behaviorally consistent with the main PR diff viewer.

## Phase 11: Add test coverage and regression fixtures

- [ ] Add production-grade tests and fixtures for parser, projection, syntax, selection, and comment anchors.

High-level intent:

- This feature is too stateful and too easy to regress to ship without tests.
- The current repo has almost no relevant automated coverage, so this phase is mandatory.

What to test:

- parser behavior for:
  - normal hunks
  - no-trailing-newline markers
  - renamed/new/deleted files
  - empty files
  - binary/unrenderable cases where supported
- row projection behavior for:
  - modified pairing
  - hunk headers
  - excerpt generation
- syntax highlighting integration for:
  - old/new file content token stitching
  - token fallback behavior
- intra-line diff behavior for:
  - equal-count modified chunks
  - long-line fallback
- selection/patch formatting for:
  - partial commit correctness
  - new file and deleted file edge cases
- comment anchors for:
  - exact side/line mapping
  - PR draft thread payload construction
  - CodeTarget session payload construction

Suggested fixture strategy:

- Add small representative unified diff fixtures and file-content fixtures.
- Reuse patterns from GitHub Desktop’s diff-related unit tests where helpful.

Acceptance criteria:

- Core diff behavior is covered by automated tests.
- The feature can be refactored without blind regressions.

## Phase 12: Hardening and cleanup

- [ ] Remove dead paths, tighten IPC contracts, and document the final architecture.

High-level intent:

- Once the feature works, remove the temporary compatibility layers and duplicate code paths.
- Ensure the final architecture is understandable to future sessions.

What to clean up:

- Old flat diff parsing helpers and renderers
- Raw-diff-only component paths
- Temporary adapter types
- IPC contracts that were added during migration but are no longer needed

Suggested documentation outputs:

- Short architecture note describing:
  - shared diff engine
  - Code vs PR interaction shells
  - syntax token pipeline
  - selection model
  - comment backend split

Acceptance criteria:

- The final implementation has one clear diff engine.
- The old low-fidelity renderer path is fully removed.
