import { CodeBlock } from "#/components/PulsingDot";
import { Kbd } from "#/components/ui/kbd";
import {
  resolveScreenshotFlow,
  type ScreenshotFlowDefinition,
} from "./screenshot-flow";

const sharedDimensions = {
  width: 2880,
  height: 1800,
} as const;

function publicAsset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}

const flowDefinition: ScreenshotFlowDefinition = {
  initialScreenId: "changes",
  areaGroups: [
    {
      id: "repo-tabs",
      areas: [
        {
          id: "repo-devland",
          label: "Open devland workspace",
          description: "Jump back to the main coding workspace.",
          targetId: "changes",
          top: 75,
          left: 12,
          width: 180,
          height: 65,
        },
        {
          id: "repo-t3",
          label: "Open t3code repo",
          description: "Switch to the T3 repo issues and pull requests tour.",
          targetId: "t3-issues",
          top: 75,
          left: 200,
          width: 168,
          height: 65,
        },
        {
          id: "repo-dub",
          label: "Open dubinc/dub repo",
          description: "Switch to a remote GitHub repository preview.",
          targetId: "dub",
          top: 75,
          left: 375,
          width: 255,
          height: 65,
        },
      ],
    },
    {
      id: "workspace-nav",
      areas: [
        {
          id: "nav-code",
          label: "Show code workspace",
          description: "Return to the coding view.",
          targetId: "changes",
          top: 150,
          left: 40,
          width: 200,
          height: 62,
        },
        {
          id: "nav-pull-requests",
          label: "Show pull request prompt session",
          description: "Open the pull request prompt session screen.",
          targetId: "prompt-session",
          top: 150,
          left: 255,
          width: 220,
          height: 62,
        },
        {
          id: "nav-community",
          label: "Show community channels",
          description: "Open the team communication workspace.",
          targetId: "community",
          top: 150,
          left: 650,
          width: 220,
          height: 62,
        },
      ],
    },
    {
      id: "workspace-panels",
      areas: [
        {
          id: "panel-changes",
          label: "Changes panel",
          description: "See staged work and commit helpers.",
          targetId: "changes",
          top: 313,
          left: 585,
          width: 180,
          height: 58,
        },
        {
          id: "panel-codex",
          label: "Codex panel",
          description: "Switch to the live AI session transcript.",
          targetId: "codex",
          top: 313,
          left: 770,
          width: 180,
          height: 58,
        },
        {
          id: "panel-browser",
          label: "Browser panel",
          description: "Switch to the built-in browser.",
          targetId: "browser",
          top: 313,
          left: 955,
          width: 180,
          height: 58,
        },
        {
          id: "panel-terminal",
          label: "Terminal panel",
          description: "Switch to the embedded terminal.",
          targetId: "terminal",
          top: 313,
          left: 1140,
          width: 180,
          height: 58,
        },
      ],
    },
    {
      id: "t3-nav",
      areas: [
        {
          id: "t3-issues-nav",
          label: "T3 issues",
          description: "Browse repository issues.",
          targetId: "t3-issues",
          top: 150,
          left: 247,
          width: 160,
          height: 62,
        },
        {
          id: "t3-prs-nav",
          label: "T3 pull requests",
          description: "Browse repository pull requests.",
          targetId: "t3-prs",
          top: 150,
          left: 414,
          width: 230,
          height: 62,
        },
      ],
    },
  ],
  screens: [
    {
      id: "changes",
      title: "Commit changes with Codex session context",
      description:
        "The workspace keeps code, git changes, and Codex in one place. Click the highlighted tool tabs to move between panels.",
      src: publicAsset("/images/1changes.png"),
      alt: "Devland changes panel with a diff viewer and commit composer.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "workspace-nav", "workspace-panels"],
      hiddenAreaIds: ["repo-devland", "nav-code", "panel-changes"],
      pulsingDots: [
        {
          id: "repos",
          x: 690,
          y: 90,
          label: "Per-repo workspaces",
          description: (
            <>
              <p>Devland ships only with the Code tab. Other tabs are repo-specific extensions defined in <Kbd>devland.json</Kbd>.</p>

              <CodeBlock>{`// devland/devland.json

{
  "worktreeSetupCommand": "bun install --cwd devland-app",
  "extensions": [
    {
      // "github:..." uses your local gh CLI to download GH release assets
      // i.e. supports private repos out of the box
      "source": "github:rafbgarcia/devland@v0.2.0#gh-prs.tgz",
      "tabName": "Pull requests",
      "tabIcon": "git-pull-request-arrow"
    },
    {
      "source": "github:rafbgarcia/devland@v0.2.0#gh-issues.tgz",
      "tabName": "Issues",
      "tabIcon": "bug"
    },
    {
      "source": "github:rafbgarcia/devland@v0.2.0#channels.tgz",
      "tabName": "Community",
      "tabIcon": "heart"
    },

    // Example of local path (for local development or even sharing on a monorepo)
    {
      "source": "path:../extensions/your-ext",
      "tabName": "Nice extension",
      "tabIcon": "lucide-icon",
      "port": 4310 // use port for development HMR
    },
  ]
}`}</CodeBlock>
            </>
          ),
          step: 1,
          side: "bottom",
        },
        {
          id: "extensions",
          x: 890,
          y: 170,
          label: "Extensions",
          description: (
            <>
              <p>Extensions can be anything that compiles to browser code and can use the minimal <a className="underline" href="https://github.com/rafbgarcia/devland/blob/main/packages/devland-sdk/src/index.ts">@devlandapp/sdk</a> npm package.</p>
              <p className="mt-2">Extensions also define a simple {'`devland.json`'} file.</p>

              <CodeBlock>{`// e.g. Pull requests devland.json
{
  "id": "@devlandapp/gh-prs",
  "name": "GitHub Pull Requests",
  "version": "0.2.2",
  "entry": "dist/index.html",
  "commands": [
    "gh",
    "git"
  ]
}
`}</CodeBlock>
            </>
          ),
          step: 2,
          side: "bottom",
        },
        {
          id: "codex-sessions",
          x: 130,
          y: 250,
          label: "Codex sessions",
          description: (
            <>
              <p>Create isolate sessions and worktrees using the buttons to the right {'---->'}</p>
              <p>or <Kbd>CMD</Kbd>+<Kbd>T</Kbd> for new local session.</p>
            </>
          ),
          step: 3,
          side: "right",
        },
        {
          id: "prompt-session",
          x: 400,
          y: 1650,
          label: "Prompt reviews idea",
          description: (
            <>
              <div className="max-w-2xl">
                <p>This is just an idea I had to try to improve OSS contributions: per-commit Codex session snapshots.</p>
                <p className="mt-2">How it works:</p>
                <p>- On commit, Devland snapshots the current Codex thread delta and writes it onto that commit with <Kbd>{'git notes --ref=devland-prompt-requests'}</Kbd> under <Kbd>{'refs/notes/devland-prompt-requests'}</Kbd>.</p>
                <p>- The note stores thread metadata plus the checkpointed transcript slice, so the session history travels with Git history instead of a separate database.</p>
                <p>- Image bytes are stored separately: each attachment is hashed, written as a blob, and added to a synthetic tree rooted at <Kbd>{'refs/devland/prompt-request-assets'}</Kbd> under paths like <Kbd>{'images/ab/<sha256>.png'}</Kbd>.</p>
                <p>- The session note keeps only <Kbd>{'{ ref, path, sha256 }'}</Kbd>, and the UI rehydrates previews later with <Kbd>{'git show <ref>:<path>'}</Kbd>.</p>
              </div>
            </>
          ),
          step: 4,
          side: "right",
        },
        {
          id: "comment-codex",
          x: 850,
          y: 590,
          label: "Github-like comments",
          description: (
            <>
              <p>You can send comments from this file diff view.</p>
              <p>Comments are appended to the always visible chat input below.</p>
            </>
          ),
          step: 5,
          side: "bottom",
        },
      ],
    },
    {
      id: "codex",
      title: "Codex stays inside the workspace",
      description:
        "The AI session is not a separate product surface. It sits beside your code, browser, and terminal.",
      src: publicAsset("/images/2codex.png"),
      alt: "Devland Codex panel showing an AI transcript inside the coding workspace.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "workspace-nav", "workspace-panels"],
      hiddenAreaIds: ["repo-devland", "nav-code", "panel-codex"],
      pulsingDots: [
        {
          id: "codex-chat",
          x: 1400,
          y: 1700,
          label: "Codex input",
          description: (
            <>
              <p>Search on active repo using <Kbd>{'@filepath'}</Kbd> or across all repos using <Kbd>{'@/filepath'}</Kbd>.</p>
            </>
          ),
          step: 1,
          side: "top",
        },
      ]
    },
    {
      id: "browser",
      title: "Use the browser without leaving the repo",
      description:
        "Research and validation stay attached to the same project session, so the context is not fragmented.",
      src: publicAsset("/images/3browser.png"),
      alt: "Devland browser panel rendering a website inside the workspace.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "workspace-nav", "workspace-panels"],
      hiddenAreaIds: ["repo-devland", "nav-code", "panel-browser"],
      pulsingDots: [
        {
          id: "browser",
          x: 1100,
          y: 290,
          label: "Per-session browser instances",
          description: (
            <>
              <p>Multi-tab support.</p>
            </>
          ),
          step: 1,
          side: "top",
        },
      ]
    },
    {
      id: "terminal",
      title: "Run commands in the same flow",
      description:
        "Terminal sessions are first-class panels, so the loop from prompt to command to code review stays tight.",
      src: publicAsset("/images/4terminal.png"),
      alt: "Devland terminal panel running shell commands inside the workspace.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "workspace-nav", "workspace-panels"],
      hiddenAreaIds: ["repo-devland", "nav-code", "panel-terminal"],
      pulsingDots: [
        {
          id: "terminal",
          x: 1300,
          y: 290,
          label: "Per-session terminal instances",
          description: (
            <>
              <p>Multi-tab support.</p>
            </>
          ),
          step: 1,
          side: "top",
        },
      ]
    },
    {
      id: "prompt-session",
      title: "Pull requests keep the prompt history attached",
      description:
        "The prompt session follows the pull request, which makes reviewable AI-assisted work much easier to inspect.",
      src: publicAsset("/images/5promptsession.png"),
      alt: "Devland pull request detail page showing an attached prompt session.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "workspace-nav"],
      hiddenAreaIds: ["repo-devland", "nav-pull-requests"],
      pulsingDots: [
        {
          id: "prompt-review",
          x: 1550,
          y: 330,
          label: "Per-commit prompt reviews",
          description: (
            <>
              <p>[WIP] This is the reviewer side of the Prompt review idea.</p>
            </>
          ),
          step: 1,
          side: "top",
        },
      ]

    },
    {
      id: "community",
      title: "Project communication lives next to execution",
      description:
        "Channels, status, and product work can sit inside the same surface instead of spreading across separate apps.",
      src: publicAsset("/images/6communities.png"),
      alt: "Devland community channels view with chat messages and member presence.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "workspace-nav"],
      hiddenAreaIds: ["repo-devland", "nav-community"],
      pulsingDots: [
        {
          id: "community",
          x: 850,
          y: 150,
          label: "Community/channels idea",
          description: (
            <>
              <p>I thought it could be handy to have Discord-like community, Q&A, etc. close to the code.</p>
              <p>It could have cool features integrated with the codebase.</p>
            </>
          ),
          step: 1,
          side: "bottom",
        },
        {
          id: "missing-notifications",
          x: 2800,
          y: 90,
          label: "Notification center (missing)",
          description: (
            <>
              <p>I'm thinking Devland should expose notification center actions to extensions via the SDK.</p>
            </>
          ),
          step: 2,
          side: "left",
        },
      ]
    },
    {
      id: "dub",
      title: "Remote repos are explorable before cloning",
      description:
        "You can browse repository context and decide when it is worth opening a local working copy.",
      src: publicAsset("/images/dub.png"),
      alt: "Devland remote GitHub repository view for the dubinc/dub project.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs"],
      hiddenAreaIds: ["repo-dub"],
      pulsingDots: [
        {
          id: "explore",
          x: 600,
          y: 280,
          label: "Explore remote Github repo",
          description: (
            <>
              <p>Developers can access the repo's community<br/> and other extensions without cloning the repo locally.</p>
            </>
          ),
          step: 1,
          side: "bottom",
        },
      ]
    },
    {
      id: "t3-issues",
      title: "Extensions can turn repos into focused workflows",
      description:
        "This example extension pulls issues into a native list, then lets you pivot into a detail view in place.",
      src: publicAsset("/images/t3issues.png"),
      alt: "Devland issue list view for the t3code repository.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "t3-nav"],
      hiddenAreaIds: ["repo-t3", "t3-issues-nav"],
      areas: [
        {
          id: "t3-issue-row",
          label: "Open selected issue",
          description: "Open the first issue in the split detail layout.",
          targetId: "t3-issue-detail",
          top: 228,
          left: 0,
          width: "100%",
          height: 160,
        },
      ],
      pulsingDots: [
        {
          id: "t3-issues",
          x: 620,
          y: 240,
          label: "Investigate with Codex",
          description: (
            <>
              <p>This action offers a customizable prompt to ask Codex<br/> to perform some action passing the issue as context.</p>
              <p className="mt-2">But we can do anything, really. Automated issue triage, contributors could submit a <br/>prompt review containing the issue investigation, so many ideas.</p>
            </>
          ),
          step: 1,
          side: "bottom",
        },
      ]
    },
    {
      id: "t3-issue-detail",
      title: "Issue detail stays anchored to the list",
      description:
        "The split layout keeps surrounding context visible while you inspect the selected issue and comments.",
      src: publicAsset("/images/t3issuedetail.png"),
      alt: "Devland issue split view with a selected issue detail panel.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "t3-nav"],
      hiddenAreaIds: ["repo-t3", "t3-issues-nav"],
      areas: [
        {
          id: "t3-issue-back",
          label: "Open selected pull request",
          description: "Open the first pull request detail in place.",
          targetId: "t3-issues",
          top: 228,
          left: 1080,
          width: 100,
          height: "100%",
        },
      ],
    },
    {
      id: "t3-prs",
      title: "Pull requests can become their own workspace",
      description:
        "Extensions can promote the data that matters for review, not just embed a web view of GitHub.",
      src: publicAsset("/images/t3prs.png"),
      alt: "Devland pull request list view for the t3code repository.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "t3-nav"],
      hiddenAreaIds: ["repo-t3", "t3-prs-nav"],
      areas: [
        {
          id: "t3-pr-row",
          label: "Open selected pull request",
          description: "Open the first pull request detail in place.",
          targetId: "t3-pr-detail",
          top: 228,
          left: 0,
          width: "100%",
          height: 160,
        },
      ],
      pulsingDots: [
        {
          id: "t3-prs",
          x: 620,
          y: 150,
          label: "Theo-inspired pull requests",
          description: (
            <>
              <p>T3-Theo-inspired PRs view with the "number of lines changed" visible in the listing<br/>as he mentions in his <a className="underline text-blue-400" href="https://www.youtube.com/watch?v=l8pQeVVaqpY">Open source is dying</a> video.</p>
            </>
          ),
          step: 1,
          side: "bottom",
        },
      ]
    },
    {
      id: "t3-pr-detail",
      title: "Prompt sessions can travel with pull request review",
      description:
        "The PR detail view shows how review metadata and prompt context can sit together in one extension surface.",
      src: publicAsset("/images/t3prdetail.png"),
      alt: "Devland pull request split view with prompt-session-aware detail content.",
      dimensions: sharedDimensions,
      areaGroupIds: ["repo-tabs", "t3-nav"],
      hiddenAreaIds: ["repo-t3", "t3-prs-nav"],
      areas: [
        {
          id: "t3-pr-back",
          label: "Open selected pull request",
          description: "Open the first pull request detail in place.",
          targetId: "t3-prs",
          top: 228,
          left: 1080,
          width: 100,
          height: "100%",
        },
      ],
    },
  ],
};

export const devlandScreenshotFlow = resolveScreenshotFlow(flowDefinition);
