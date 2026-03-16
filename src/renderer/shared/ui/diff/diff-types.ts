export type DiffSelection =
  | { type: 'commit'; index: number }
  | { type: 'all' };

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string };
