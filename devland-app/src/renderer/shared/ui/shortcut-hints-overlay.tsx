import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';

import type { ShortcutEntry, ShortcutGroup } from '@/renderer/shared/lib/shortcut-hints';
import { Kbd, KbdGroup } from '@/shadcn/components/ui/kbd';

function ShortcutKey({ value }: { value: string }) {
  return (
    <Kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-muted/60 px-1.5 text-[10px] font-medium uppercase leading-none shadow-sm">
      {value}
    </Kbd>
  );
}

function ShortcutRow({ keys, label }: ShortcutEntry) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <KbdGroup className="shrink-0 gap-0.5">
        {keys.map((key) => (
          <ShortcutKey key={key} value={key} />
        ))}
      </KbdGroup>
    </div>
  );
}

export function ShortcutHintsOverlay({
  open,
  groups,
}: {
  open: boolean;
  groups: ShortcutGroup[];
}) {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="w-64 rounded-xl border border-border/60 bg-background/95 px-5 py-4 shadow-2xl backdrop-blur-md"
          >
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.title} className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    {group.title}
                  </span>
                  <div className="flex flex-col gap-1">
                    {group.shortcuts.map((shortcut) => (
                      <ShortcutRow
                        key={shortcut.label}
                        keys={shortcut.keys}
                        label={shortcut.label}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
