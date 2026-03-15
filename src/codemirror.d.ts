declare module 'codemirror/addon/runmode/runmode.node.js' {
  import type CodeMirror from 'codemirror';

  export const getMode: typeof CodeMirror.getMode;
  export const innerMode: typeof CodeMirror.innerMode;
  export const StringStream: typeof CodeMirror.StringStream;
}

declare module 'codemirror/mode/*';
declare module 'codemirror-mode-elixir';
declare module 'codemirror-mode-luau';
declare module 'codemirror-mode-zig';

declare module '*?worker' {
  const WorkerFactory: {
    new (): Worker;
  };

  export default WorkerFactory;
}
