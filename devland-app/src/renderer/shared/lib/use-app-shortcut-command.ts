import { useEffect, useEffectEvent, useState } from 'react';

import type { AppShortcutCommand } from '@/ipc/contracts';

export function useAppShortcutCommand(
  handler: (command: AppShortcutCommand) => void,
): void {
  const onCommand = useEffectEvent(handler);

  useEffect(
    () => window.electronAPI.onAppShortcutCommand((command) => onCommand(command)),
    [onCommand],
  );
}

export function useShortcutHintsOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useAppShortcutCommand((command) => {
    if (command.type !== 'toggle-shortcut-hints') {
      return;
    }

    setIsOpen((current) => !current);
  });

  useEffect(() => {
    const handleBlur = () => {
      setIsOpen(false);
    };

    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return isOpen;
}
