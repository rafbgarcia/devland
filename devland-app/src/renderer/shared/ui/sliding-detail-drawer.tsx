import { useEffect, type ReactNode } from 'react';

import { AnimatePresence, motion } from 'motion/react';

import { DrawerCloseButton } from '@/renderer/shared/ui/drawer-close-button';

export function SlidingDetailDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.15 }}
          className="fixed inset-y-0 right-0 z-50 flex w-[60vw] flex-row shadow-lg"
        >
          <DrawerCloseButton onClick={onClose} />
          <div className="flex min-w-0 flex-1 flex-col bg-background">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
