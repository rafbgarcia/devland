import { Component, createRef } from 'react';

import { getTruncatedFilePathParts } from '@/lib/truncate-filepath';
import { cn } from '@/shadcn/lib/utils';

const FILE_PATH_FITTING_TOLERANCE_PX = 3;

type FilePathDisplayState = {
  directoryText: string;
  fileText: string;
  length: number;
};

type FilePathState = FilePathDisplayState & {
  availableWidth: number | undefined;
  fullTextWidth: number | undefined;
  longestFit: number;
  shortestNonFit: number | undefined;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createDisplayState(path: string, length = path.length): FilePathDisplayState {
  if (length <= 0) {
    return {
      directoryText: '',
      fileText: '',
      length,
    };
  }

  const { directory, fileName } = getTruncatedFilePathParts(path, length);

  return {
    directoryText: directory,
    fileText: fileName,
    length,
  };
}

function createState(path: string, length?: number): FilePathState {
  return {
    availableWidth: undefined,
    fullTextWidth: undefined,
    longestFit: 0,
    shortestNonFit: undefined,
    ...createDisplayState(path, length),
  };
}

function areStatesEqual(current: FilePathState, next: FilePathState) {
  return (
    current.availableWidth === next.availableWidth &&
    current.fullTextWidth === next.fullTextWidth &&
    current.longestFit === next.longestFit &&
    current.shortestNonFit === next.shortestNonFit &&
    current.directoryText === next.directoryText &&
    current.fileText === next.fileText &&
    current.length === next.length
  );
}

type TruncatedFilePathProps = {
  path: string;
  className?: string;
};

export class TruncatedFilePath extends Component<TruncatedFilePathProps, FilePathState> {
  public override state: FilePathState = createState(this.props.path);

  private readonly containerRef = createRef<HTMLDivElement>();
  private innerElement: HTMLSpanElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  public override componentDidMount() {
    this.resizeIfNecessary();

    if (this.containerRef.current) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resizeIfNecessary();
      });
      this.resizeObserver.observe(this.containerRef.current);
    }
  }

  public override componentDidUpdate(prevProps: Readonly<TruncatedFilePathProps>) {
    if (prevProps.path !== this.props.path) {
      const nextState = createState(this.props.path);

      if (!areStatesEqual(this.state, nextState)) {
        this.setState(nextState);
        return;
      }
    }

    this.resizeIfNecessary();
  }

  public override componentWillUnmount() {
    this.resizeObserver?.disconnect();
  }

  public override render() {
    const truncated = this.state.length < this.props.path.length;

    return (
      <div
        ref={this.containerRef}
        className={cn('min-w-0 overflow-hidden whitespace-nowrap', this.props.className)}
        title={truncated ? this.props.path : undefined}
      >
        <span ref={this.onInnerElementRef}>
          {this.state.directoryText.length > 0 ? (
            <span className="text-muted-foreground">{this.state.directoryText}</span>
          ) : null}
          <span className="font-bold">{this.state.fileText}</span>
        </span>
      </div>
    );
  }

  private readonly onInnerElementRef = (element: HTMLSpanElement | null) => {
    this.innerElement = element;
  };

  private resizeIfNecessary() {
    if (!this.containerRef.current || !this.innerElement) {
      return;
    }

    const availableWidth = Math.max(
      this.containerRef.current.getBoundingClientRect().width,
      0,
    );

    if (
      this.state.fullTextWidth !== undefined &&
      this.state.fullTextWidth <= availableWidth
    ) {
      if (this.state.length === this.props.path.length) {
        if (availableWidth !== this.state.availableWidth) {
          this.setState((current) => {
            const nextState = { ...current, availableWidth };
            return areStatesEqual(current, nextState) ? null : nextState;
          });
        }

        return;
      }

      this.setState((current) => {
        const nextState = {
          ...current,
          ...createDisplayState(this.props.path),
          availableWidth,
        };

        return areStatesEqual(current, nextState) ? null : nextState;
      });
      return;
    }

    if (
      this.state.availableWidth !== undefined &&
      this.state.availableWidth !== availableWidth
    ) {
      const resetState = createState(this.props.path, this.state.length);

      if (availableWidth < this.state.availableWidth) {
        const nextState = {
          ...resetState,
          availableWidth,
          fullTextWidth: this.state.fullTextWidth,
          shortestNonFit: this.state.shortestNonFit,
        };

        if (!areStatesEqual(this.state, nextState)) {
          this.setState(nextState);
        }

        return;
      }

      if (availableWidth > this.state.availableWidth) {
        const nextState = {
          ...resetState,
          availableWidth,
          fullTextWidth: this.state.fullTextWidth,
          longestFit: this.state.longestFit,
        };

        if (!areStatesEqual(this.state, nextState)) {
          this.setState(nextState);
        }

        return;
      }
    }

    if (availableWidth === 0) {
      const nextState = {
        ...this.state,
        ...createDisplayState(this.props.path, 0),
        availableWidth,
        longestFit: 0,
        shortestNonFit: 1,
      };

      if (!areStatesEqual(this.state, nextState)) {
        this.setState(nextState);
      }

      return;
    }

    const actualWidth = this.innerElement.getBoundingClientRect().width;
    const fullTextWidth =
      this.state.length === this.props.path.length
        ? actualWidth
        : this.state.fullTextWidth;
    const ratio = actualWidth === 0 ? 0.5 : availableWidth / actualWidth;

    if (actualWidth <= availableWidth) {
      if (this.state.length === this.props.path.length) {
        const nextState = {
          ...this.state,
          availableWidth,
          fullTextWidth,
        };

        if (!areStatesEqual(this.state, nextState)) {
          this.setState(nextState);
        }

        return;
      }

      const longestFit = this.state.length;
      const maxChars =
        this.state.shortestNonFit !== undefined
          ? this.state.shortestNonFit - 1
          : this.props.path.length;
      const minChars = longestFit + 1;

      if (
        minChars >= maxChars ||
        availableWidth - actualWidth < FILE_PATH_FITTING_TOLERANCE_PX
      ) {
        const nextState = {
          ...this.state,
          longestFit,
          availableWidth,
          fullTextWidth,
        };

        if (!areStatesEqual(this.state, nextState)) {
          this.setState(nextState);
        }

        return;
      }

      const length = clamp(
        Math.floor(this.state.length * ratio),
        minChars,
        maxChars,
      );
      const nextState = {
        ...this.state,
        ...createDisplayState(this.props.path, length),
        longestFit,
        availableWidth,
        fullTextWidth,
      };

      if (!areStatesEqual(this.state, nextState)) {
        this.setState(nextState);
      }

      return;
    }

    const shortestNonFit = this.state.length;
    const maxChars = shortestNonFit - 1;
    const minChars = this.state.longestFit;
    const length = clamp(
      Math.floor(this.state.length * ratio),
      minChars,
      maxChars,
    );
    const nextState = {
      ...this.state,
      ...createDisplayState(this.props.path, length),
      availableWidth,
      fullTextWidth,
      shortestNonFit,
    };

    if (!areStatesEqual(this.state, nextState)) {
      this.setState(nextState);
    }
  }
}
