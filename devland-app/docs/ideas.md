MLP
- Onboarding: don't require `gh` CLI, handle
  - Handle add repo
    - Read remote repo's `devland.json` to install extensions for remote repos
  - PR and Issue tab must handle missing `gh` CLI themselves
- Devapp ships only with Code tab
- Extract PRs/Issues/Channels into extensions
- Channels needs auth
- Worktree branch naming
- Prompt request extension:
- Files changed ordered by change order: i.e. shows Codex order of changes
- Open files with CMD + P (use diff viewer): readonly; comments for Codex session;
- Shortcuts: CMD+D duplicate current session on new tab, CMD+T create new worktree (configure worktree setup script, maybe `.devland/setup`)
- One-click setup repo `devland.json` "initialDevelopmentSetupCommand"
- App shortcuts

TODO:
Diff viewer
- double-click open on editor (Editor user preference)
