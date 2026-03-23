import type { Input, WebContents } from 'electron';

import type { AppShortcutCommand } from '@/ipc/contracts';

type RegisteredShortcut = {
  accelerator: string;
  command: AppShortcutCommand;
};

type ShortcutRegistrar = {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
};

const SHORTCUT_DISPATCH_DEDUPE_WINDOW_MS = 32;

export const APP_SHORTCUT_ACCELERATORS: readonly RegisteredShortcut[] = [
  {
    accelerator: 'CommandOrControl+Shift+[',
    command: {
      type: 'cycle-code-target-tab',
      direction: 'previous',
    },
  },
  {
    accelerator: 'CommandOrControl+Shift+]',
    command: {
      type: 'cycle-code-target-tab',
      direction: 'next',
    },
  },
  {
    accelerator: 'CommandOrControl+[',
    command: {
      type: 'cycle-code-pane',
      direction: 'previous',
    },
  },
  {
    accelerator: 'CommandOrControl+]',
    command: {
      type: 'cycle-code-pane',
      direction: 'next',
    },
  },
  {
    accelerator: 'CommandOrControl+T',
    command: {
      type: 'create-code-session',
    },
  },
  {
    accelerator: 'CommandOrControl+W',
    command: {
      type: 'close-current-tab',
    },
  },
  {
    accelerator: 'CommandOrControl+/',
    command: {
      type: 'toggle-shortcut-hints',
    },
  },
  ...Array.from({ length: 9 }, (_value, index) => ({
    accelerator: `CommandOrControl+${index + 1}`,
    command: {
      type: 'activate-project-tab-by-shortcut-slot' as const,
      slot: index + 1,
    },
  })),
] as const;

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

export const createAppShortcutCommandDispatcher = (
  onCommand: (command: AppShortcutCommand) => void,
): ((command: AppShortcutCommand) => void) => {
  let lastDispatchedSignature = '';
  let lastDispatchedAt = 0;

  return (command) => {
    const commandSignature = JSON.stringify(command);
    const now = Date.now();

    if (
      commandSignature === lastDispatchedSignature &&
      now - lastDispatchedAt <= SHORTCUT_DISPATCH_DEDUPE_WINDOW_MS
    ) {
      return;
    }

    lastDispatchedSignature = commandSignature;
    lastDispatchedAt = now;
    onCommand(command);
  };
};

export const registerGlobalAppShortcutBindings = (
  shortcutRegistrar: ShortcutRegistrar,
  onCommand: (command: AppShortcutCommand) => void,
): (() => void) => {
  const registeredAccelerators: string[] = [];

  for (const binding of APP_SHORTCUT_ACCELERATORS) {
    const didRegister = shortcutRegistrar.register(
      binding.accelerator,
      () => onCommand(binding.command),
    );

    if (didRegister) {
      registeredAccelerators.push(binding.accelerator);
    }
  }

  return () => {
    for (const accelerator of registeredAccelerators) {
      shortcutRegistrar.unregister(accelerator);
    }
  };
};
