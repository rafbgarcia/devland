* project tags: Electron Forge; Tailwind; Shadcn; BunJS; clean, beautiful design and UX; motion/react; dayjs (src/lib/dayjs.ts);
* project stage: greenfield; not live; no users; no backwards compatibility;
* behaviors: think first principles; write production-grade code;
* project guidelines
  - file structure: feature folders plus an explicit shared layer
    . colocate feature-local code, e.g. `src/renderer/code-screen/`
    . shared renderer layer: `src/renderer/shared/`
    . non-renderer code outside `src/renderer`
    . thin `src/routes/` files

HARD STOP RULES:
- HARD STOP on ambiguious decisions; design choices; compromises; product decisions;
- HARD STOP when you notice design flaws, inappropriate production code or tests;
- HARD STOP make sure you have loaded shadcn skill for UI changes;
