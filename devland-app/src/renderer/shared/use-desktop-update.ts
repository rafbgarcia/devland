import { useEffect, useState } from 'react';

import type { DesktopUpdateState } from '@/ipc/contracts';

export function useDesktopUpdate(): DesktopUpdateState | null {
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    let cancelled = false;

    void window.electronAPI.getUpdateState().then((state) => {
      if (!cancelled) {
        setUpdateState(state);
      }
    });

    const unsubscribe = window.electronAPI.onUpdateState((state) => {
      setUpdateState(state);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return updateState;
}
