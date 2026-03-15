import type { DiffDisplayMode } from '@/lib/diff';
import { useUserPreferences } from '@/renderer/hooks/use-user-preferences';
import { ToggleGroup, ToggleGroupItem } from '@/shadcn/components/ui/toggle-group';
import { cn } from '@/shadcn/lib/utils';

const DISPLAY_MODE_OPTIONS: Array<{ value: DiffDisplayMode; label: string }> = [
  { value: 'unified', label: 'Unified' },
  { value: 'split', label: 'Split' },
];

export function DiffDisplayModeToolbar({
  className,
}: {
  className?: string;
}) {
  const { preferences, setDiffDisplayMode } = useUserPreferences();

  return (
    <div className={cn('flex items-center justify-end border-b border-border bg-background/85 px-4 py-2 backdrop-blur-sm', className)}>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Diff display</span>
        <ToggleGroup
          multiple={false}
          value={[preferences.diffDisplayMode]}
          onValueChange={(values) => {
            const nextValue = values[0];

            if (nextValue === 'unified' || nextValue === 'split') {
              setDiffDisplayMode(nextValue);
            }
          }}
          variant="outline"
          size="sm"
        >
          {DISPLAY_MODE_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}
