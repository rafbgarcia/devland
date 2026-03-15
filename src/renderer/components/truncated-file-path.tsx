import {
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getTruncatedFilePathParts } from '@/lib/truncate-filepath';
import { cn } from '@/shadcn/lib/utils';

const FILE_PATH_FITTING_TOLERANCE_PX = 3;

type FilePathMeasureState = {
  availableWidth: number | undefined;
  fullTextWidth: number | undefined;
  length: number;
  longestFit: number;
  shortestNonFit: number | undefined;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createFilePathMeasureState(
  path: string,
  length = path.length,
): FilePathMeasureState {
  return {
    availableWidth: undefined,
    fullTextWidth: undefined,
    length,
    longestFit: 0,
    shortestNonFit: undefined,
  };
}

function areFilePathMeasureStatesEqual(
  current: FilePathMeasureState,
  next: FilePathMeasureState,
) {
  return (
    current.availableWidth === next.availableWidth &&
    current.fullTextWidth === next.fullTextWidth &&
    current.length === next.length &&
    current.longestFit === next.longestFit &&
    current.shortestNonFit === next.shortestNonFit
  );
}

export function TruncatedFilePath({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [measureState, setMeasureState] = useState(() => createFilePathMeasureState(path));

  const truncatedPath = useMemo(
    () => getTruncatedFilePathParts(path, measureState.length),
    [measureState.length, path],
  );

  useLayoutEffect(() => {
    setMeasureState(createFilePathMeasureState(path));
  }, [path]);

  const resizeIfNecessary = useEffectEvent(() => {
    const containerElement = containerRef.current;
    const contentElement = contentRef.current;
    if (!containerElement || !contentElement) {
      return;
    }

    const availableWidth = Math.max(containerElement.getBoundingClientRect().width, 0);

    if (
      measureState.fullTextWidth !== undefined &&
      measureState.fullTextWidth <= availableWidth
    ) {
      if (measureState.length === path.length) {
        if (availableWidth !== measureState.availableWidth) {
          setMeasureState((current) => {
            const nextState = { ...current, availableWidth };
            return areFilePathMeasureStatesEqual(current, nextState) ? current : nextState;
          });
        }

        return;
      }

      const nextState = {
        ...createFilePathMeasureState(path),
        availableWidth,
        fullTextWidth: measureState.fullTextWidth,
        length: path.length,
        longestFit: path.length,
      };
      setMeasureState((current) => (
        areFilePathMeasureStatesEqual(current, nextState) ? current : nextState
      ));
      return;
    }

    if (
      measureState.availableWidth !== undefined &&
      measureState.availableWidth !== availableWidth
    ) {
      const nextState = createFilePathMeasureState(path, measureState.length);

      if (availableWidth < measureState.availableWidth) {
        const smallerWidthState = {
          ...nextState,
          availableWidth,
          fullTextWidth: measureState.fullTextWidth,
          shortestNonFit: measureState.shortestNonFit,
        };
        setMeasureState((current) => (
          areFilePathMeasureStatesEqual(current, smallerWidthState) ? current : smallerWidthState
        ));
        return;
      }

      if (availableWidth > measureState.availableWidth) {
        const largerWidthState = {
          ...nextState,
          availableWidth,
          fullTextWidth: measureState.fullTextWidth,
          longestFit: measureState.longestFit,
        };
        setMeasureState((current) => (
          areFilePathMeasureStatesEqual(current, largerWidthState) ? current : largerWidthState
        ));
        return;
      }
    }

    if (availableWidth === 0) {
      if (measureState.length !== 0) {
        const zeroWidthState = {
          availableWidth,
          fullTextWidth: measureState.fullTextWidth,
          length: 0,
          longestFit: 0,
          shortestNonFit: 1,
        };
        setMeasureState((current) => (
          areFilePathMeasureStatesEqual(current, zeroWidthState) ? current : zeroWidthState
        ));
      }

      return;
    }

    const actualWidth = contentElement.getBoundingClientRect().width;
    const fullTextWidth =
      measureState.length === path.length ? actualWidth : measureState.fullTextWidth;
    const ratio = actualWidth === 0 ? 0.5 : availableWidth / actualWidth;

    if (actualWidth <= availableWidth) {
      if (measureState.length === path.length) {
        setMeasureState((current) => {
          const nextState = {
            ...current,
            availableWidth,
            fullTextWidth,
          };
          return areFilePathMeasureStatesEqual(current, nextState) ? current : nextState;
        });
        return;
      }

      const longestFit = measureState.length;
      const maxChars = measureState.shortestNonFit !== undefined
        ? measureState.shortestNonFit - 1
        : path.length;
      const minChars = longestFit + 1;

      if (
        minChars >= maxChars ||
        availableWidth - actualWidth < FILE_PATH_FITTING_TOLERANCE_PX
      ) {
        setMeasureState((current) => {
          const nextState = {
            ...current,
            availableWidth,
            fullTextWidth,
            longestFit,
          };
          return areFilePathMeasureStatesEqual(current, nextState) ? current : nextState;
        });
        return;
      }

      const length = clamp(
        Math.floor(measureState.length * ratio),
        minChars,
        maxChars,
      );

      const nextState = {
        ...measureState,
        availableWidth,
        fullTextWidth,
        length,
        longestFit,
      };
      setMeasureState((current) => (
        areFilePathMeasureStatesEqual(current, nextState) ? current : nextState
      ));
      return;
    }

    const shortestNonFit = measureState.length;
    const maxChars = shortestNonFit - 1;
    const minChars = measureState.longestFit || 0;
    const length = clamp(
      Math.floor(measureState.length * ratio),
      minChars,
      maxChars,
    );

    const nextState = {
      ...measureState,
      availableWidth,
      fullTextWidth,
      length,
      shortestNonFit,
    };
    setMeasureState((current) => (
      areFilePathMeasureStatesEqual(current, nextState) ? current : nextState
    ));
  });

  useLayoutEffect(() => {
    resizeIfNecessary();
  }, [measureState.length, path, resizeIfNecessary, truncatedPath.path]);

  useLayoutEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) {
      return;
    }

    const observer = new ResizeObserver(() => {
      resizeIfNecessary();
    });

    observer.observe(containerElement);
    return () => observer.disconnect();
  }, [resizeIfNecessary]);

  return (
    <span
      ref={containerRef}
      className={cn('block min-w-0 overflow-hidden whitespace-nowrap', className)}
      title={truncatedPath.isTruncated ? path : undefined}
    >
      <span
        ref={contentRef}
        className="inline-flex max-w-none items-baseline whitespace-nowrap"
      >
        {truncatedPath.directory ? (
          <span className="text-muted-foreground">{truncatedPath.directory}</span>
        ) : null}
        <span className="font-bold">{truncatedPath.fileName}</span>
      </span>
    </span>
  );
}
