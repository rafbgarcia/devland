export type ShortcutEntry = {
  keys: string[];
  label: string;
};

export type ShortcutGroup = {
  title: string;
  shortcuts: ShortcutEntry[];
};

export const PROJECT_SHORTCUT_GROUP: ShortcutGroup = {
  title: 'Projects',
  shortcuts: [
    { keys: ['\u2318', '1-8'], label: 'Switch repo' },
    { keys: ['\u2318', '9'], label: 'Last repo' },
  ],
};

export const CODE_SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Tabs',
    shortcuts: [
      { keys: ['\u21E7', '\u2318', '['], label: 'Previous tab' },
      { keys: ['\u21E7', '\u2318', ']'], label: 'Next tab' },
      { keys: ['\u2318', 'T'], label: 'New session' },
      { keys: ['\u2318', 'W'], label: 'Close tab' },
    ],
  },
  {
    title: 'Panes',
    shortcuts: [
      { keys: ['\u2318', '['], label: 'Previous pane' },
      { keys: ['\u2318', ']'], label: 'Next pane' },
    ],
  },
];
