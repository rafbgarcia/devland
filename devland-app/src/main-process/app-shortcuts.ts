import type { Input, WebContents } from 'electron';

import type { AppShortcutCommand } from '@/ipc/contracts';

export const getAppShortcutCommand = (input: Input): AppShortcutCommand | null => {
  if (input.isComposing) {
    return null;
  }

  if (
    input.type !== 'keyDown' ||
    !input.meta ||
    input.alt ||
    input.control
  ) {
    return null;
  }

  if (input.shift && input.code === 'BracketLeft') {
    return {
      type: 'cycle-code-target-tab',
      direction: 'previous',
    };
  }

  if (input.shift && input.code === 'BracketRight') {
    return {
      type: 'cycle-code-target-tab',
      direction: 'next',
    };
  }

  if (!input.shift && input.code === 'BracketLeft') {
    return {
      type: 'cycle-code-pane',
      direction: 'previous',
    };
  }

  if (!input.shift && input.code === 'BracketRight') {
    return {
      type: 'cycle-code-pane',
      direction: 'next',
    };
  }

  if (!input.shift && input.code === 'KeyT') {
    return {
      type: 'create-code-session',
    };
  }

  if (!input.shift && input.code === 'KeyW') {
    return {
      type: 'close-current-tab',
    };
  }

  if (!input.shift && input.code === 'Slash') {
    return {
      type: 'toggle-shortcut-hints',
    };
  }

  if (input.shift || !input.code.startsWith('Digit')) {
    return null;
  }

  const shortcutIndex = Number(input.code.slice('Digit'.length)) - 1;

  if (!Number.isInteger(shortcutIndex) || shortcutIndex < 0 || shortcutIndex > 8) {
    return null;
  }

  return {
    type: 'activate-project-tab-by-shortcut-slot',
    slot: shortcutIndex + 1,
  };
};

export const registerAppShortcutForwarding = (
  webContents: WebContents,
  onCommand: (command: AppShortcutCommand) => void,
): void => {
  webContents.on('before-input-event', (event, input) => {
    const command = getAppShortcutCommand(input);

    if (command === null) {
      return;
    }

    event.preventDefault();
    onCommand(command);
  });
};
