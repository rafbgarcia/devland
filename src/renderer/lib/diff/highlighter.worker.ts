/// <reference lib="webworker" />

import type CodeMirror from 'codemirror';
import {
  getMode,
  innerMode,
  StringStream,
} from 'codemirror/addon/runmode/runmode.node.js';

import type {
  DiffHighlightRequest,
  DiffHighlightResponse,
} from '@/lib/diff/highlighter-types';

type ModeDefinition = {
  install: () => Promise<unknown>;
  mappings: Record<string, string>;
};

const extensionModes: ReadonlyArray<ModeDefinition> = [
  {
    install: () => import('codemirror/mode/javascript/javascript'),
    mappings: {
      '.ts': 'text/typescript',
      '.mts': 'text/typescript',
      '.cts': 'text/typescript',
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
      '.cjs': 'text/javascript',
      '.json': 'application/json',
    },
  },
  {
    install: () => import('codemirror/mode/coffeescript/coffeescript'),
    mappings: { '.coffee': 'text/x-coffeescript' },
  },
  {
    install: () => import('codemirror/mode/jsx/jsx'),
    mappings: {
      '.tsx': 'text/typescript-jsx',
      '.mtsx': 'text/typescript-jsx',
      '.ctsx': 'text/typescript-jsx',
      '.jsx': 'text/jsx',
      '.mjsx': 'text/jsx',
      '.cjsx': 'text/jsx',
    },
  },
  {
    install: () => import('codemirror/mode/htmlmixed/htmlmixed'),
    mappings: { '.html': 'text/html', '.htm': 'text/html' },
  },
  {
    install: () => import('codemirror/mode/htmlembedded/htmlembedded'),
    mappings: {
      '.aspx': 'application/x-aspx',
      '.cshtml': 'application/x-aspx',
      '.jsp': 'application/x-jsp',
    },
  },
  {
    install: () => import('codemirror/mode/css/css'),
    mappings: {
      '.css': 'text/css',
      '.scss': 'text/x-scss',
      '.less': 'text/x-less',
    },
  },
  {
    install: () => import('codemirror/mode/vue/vue'),
    mappings: { '.vue': 'text/x-vue' },
  },
  {
    install: () => import('codemirror/mode/markdown/markdown'),
    mappings: {
      '.markdown': 'text/x-markdown',
      '.md': 'text/x-markdown',
      '.mdx': 'text/x-markdown',
    },
  },
  {
    install: () => import('codemirror/mode/yaml/yaml'),
    mappings: { '.yaml': 'text/yaml', '.yml': 'text/yaml' },
  },
  {
    install: () => import('codemirror/mode/xml/xml'),
    mappings: {
      '.xml': 'text/xml',
      '.xaml': 'text/xml',
      '.xsd': 'text/xml',
      '.csproj': 'text/xml',
      '.fsproj': 'text/xml',
      '.vcxproj': 'text/xml',
      '.vbproj': 'text/xml',
      '.svg': 'text/xml',
      '.resx': 'text/xml',
      '.props': 'text/xml',
      '.targets': 'text/xml',
    },
  },
  {
    install: () => import('codemirror/mode/diff/diff'),
    mappings: { '.diff': 'text/x-diff', '.patch': 'text/x-diff' },
  },
  {
    install: () => import('codemirror/mode/clike/clike'),
    mappings: {
      '.m': 'text/x-objectivec',
      '.scala': 'text/x-scala',
      '.sc': 'text/x-scala',
      '.cs': 'text/x-csharp',
      '.cake': 'text/x-csharp',
      '.java': 'text/x-java',
      '.c': 'text/x-c',
      '.h': 'text/x-c',
      '.cpp': 'text/x-c++src',
      '.hpp': 'text/x-c++src',
      '.cc': 'text/x-c++src',
      '.hh': 'text/x-c++src',
      '.hxx': 'text/x-c++src',
      '.cxx': 'text/x-c++src',
      '.ino': 'text/x-c++src',
      '.kt': 'text/x-kotlin',
    },
  },
  {
    install: () => import('codemirror/mode/mllike/mllike'),
    mappings: {
      '.ml': 'text/x-ocaml',
      '.fs': 'text/x-fsharp',
      '.fsx': 'text/x-fsharp',
      '.fsi': 'text/x-fsharp',
    },
  },
  {
    install: () => import('codemirror/mode/swift/swift'),
    mappings: { '.swift': 'text/x-swift' },
  },
  {
    install: () => import('codemirror/mode/shell/shell'),
    mappings: { '.sh': 'text/x-sh' },
  },
  {
    install: () => import('codemirror/mode/sql/sql'),
    mappings: { '.sql': 'text/x-sql' },
  },
  {
    install: () => import('codemirror/mode/cypher/cypher'),
    mappings: { '.cql': 'application/x-cypher-query' },
  },
  {
    install: () => import('codemirror/mode/go/go'),
    mappings: { '.go': 'text/x-go' },
  },
  {
    install: () => import('codemirror/mode/perl/perl'),
    mappings: { '.pl': 'text/x-perl' },
  },
  {
    install: () => import('codemirror/mode/php/php'),
    mappings: { '.php': 'application/x-httpd-php' },
  },
  {
    install: () => import('codemirror/mode/python/python'),
    mappings: {
      '.py': 'text/x-python',
      '.pyi': 'text/x-python',
      '.vpy': 'text/x-python',
    },
  },
  {
    install: () => import('codemirror/mode/ruby/ruby'),
    mappings: { '.rb': 'text/x-ruby' },
  },
  {
    install: () => import('codemirror/mode/clojure/clojure'),
    mappings: {
      '.clj': 'text/x-clojure',
      '.cljc': 'text/x-clojure',
      '.cljs': 'text/x-clojure',
      '.edn': 'text/x-clojure',
    },
  },
  {
    install: () => import('codemirror/mode/rust/rust'),
    mappings: { '.rs': 'text/x-rustsrc' },
  },
  {
    install: () => import('codemirror-mode-elixir'),
    mappings: { '.ex': 'text/x-elixir', '.exs': 'text/x-elixir' },
  },
  {
    install: () => import('codemirror/mode/haxe/haxe'),
    mappings: { '.hx': 'text/x-haxe' },
  },
  {
    install: () => import('codemirror/mode/r/r'),
    mappings: { '.r': 'text/x-rsrc' },
  },
  {
    install: () => import('codemirror/mode/powershell/powershell'),
    mappings: { '.ps1': 'application/x-powershell' },
  },
  {
    install: () => import('codemirror/mode/vb/vb'),
    mappings: { '.vb': 'text/x-vb' },
  },
  {
    install: () => import('codemirror/mode/fortran/fortran'),
    mappings: { '.f': 'text/x-fortran', '.f90': 'text/x-fortran' },
  },
  {
    install: () => import('codemirror-mode-luau'),
    mappings: { '.lua': 'text/x-lua', '.luau': 'text/x-luau' },
  },
  {
    install: () => import('codemirror/mode/crystal/crystal'),
    mappings: { '.cr': 'text/x-crystal' },
  },
  {
    install: () => import('codemirror/mode/julia/julia'),
    mappings: { '.jl': 'text/x-julia' },
  },
  {
    install: () => import('codemirror/mode/stex/stex'),
    mappings: { '.tex': 'text/x-stex' },
  },
  {
    install: () => import('codemirror/mode/sparql/sparql'),
    mappings: { '.rq': 'application/sparql-query' },
  },
  {
    install: () => import('codemirror/mode/stylus/stylus'),
    mappings: { '.styl': 'text/x-styl' },
  },
  {
    install: () => import('codemirror/mode/soy/soy'),
    mappings: { '.soy': 'text/x-soy' },
  },
  {
    install: () => import('codemirror/mode/smalltalk/smalltalk'),
    mappings: { '.st': 'text/x-stsrc' },
  },
  {
    install: () => import('codemirror/mode/slim/slim'),
    mappings: { '.slim': 'application/x-slim' },
  },
  {
    install: () => import('codemirror/mode/haml/haml'),
    mappings: { '.haml': 'text/x-haml' },
  },
  {
    install: () => import('codemirror/mode/sieve/sieve'),
    mappings: { '.sieve': 'application/sieve' },
  },
  {
    install: () => import('codemirror/mode/scheme/scheme'),
    mappings: {
      '.ss': 'text/x-scheme',
      '.sls': 'text/x-scheme',
      '.scm': 'text/x-scheme',
    },
  },
  {
    install: () => import('codemirror/mode/rst/rst'),
    mappings: { '.rst': 'text/x-rst' },
  },
  {
    install: () => import('codemirror/mode/rpm/rpm'),
    mappings: { '.rpm': 'text/x-rpm-spec' },
  },
  {
    install: () => import('codemirror/mode/q/q'),
    mappings: { '.q': 'text/x-q' },
  },
  {
    install: () => import('codemirror/mode/puppet/puppet'),
    mappings: { '.pp': 'text/x-puppet' },
  },
  {
    install: () => import('codemirror/mode/pug/pug'),
    mappings: { '.pug': 'text/x-pug' },
  },
  {
    install: () => import('codemirror/mode/protobuf/protobuf'),
    mappings: { '.proto': 'text/x-protobuf' },
  },
  {
    install: () => import('codemirror/mode/properties/properties'),
    mappings: {
      '.properties': 'text/x-properties',
      '.gitattributes': 'text/x-properties',
      '.gitignore': 'text/x-properties',
      '.editorconfig': 'text/x-properties',
      '.ini': 'text/x-ini',
    },
  },
  {
    install: () => import('codemirror/mode/pig/pig'),
    mappings: { '.pig': 'text/x-pig' },
  },
  {
    install: () => import('codemirror/mode/asciiarmor/asciiarmor'),
    mappings: { '.pgp': 'application/pgp' },
  },
  {
    install: () => import('codemirror/mode/oz/oz'),
    mappings: { '.oz': 'text/x-oz' },
  },
  {
    install: () => import('codemirror/mode/pascal/pascal'),
    mappings: { '.pas': 'text/x-pascal' },
  },
  {
    install: () => import('codemirror/mode/toml/toml'),
    mappings: { '.toml': 'text/x-toml' },
  },
  {
    install: () => import('codemirror/mode/dart/dart'),
    mappings: { '.dart': 'application/dart' },
  },
  {
    install: () => import('codemirror-mode-zig'),
    mappings: { '.zig': 'text/x-zig' },
  },
  {
    install: () => import('codemirror/mode/cmake/cmake'),
    mappings: { '.cmake': 'text/x-cmake' },
  },
];

const basenameModes: ReadonlyArray<ModeDefinition> = [
  {
    install: () => import('codemirror/mode/dockerfile/dockerfile'),
    mappings: { dockerfile: 'text/x-dockerfile' },
  },
  {
    install: () => import('codemirror/mode/toml/toml'),
    mappings: { 'cargo.lock': 'text/x-toml' },
  },
];

const extensionMIMEMap = new Map<string, string>();
const basenameMIMEMap = new Map<string, string>();
const mimeModeMap = new Map<string, ModeDefinition>();

for (const mode of extensionModes) {
  for (const [mapping, mimeType] of Object.entries(mode.mappings)) {
    extensionMIMEMap.set(mapping, mimeType);
    mimeModeMap.set(mimeType, mode);
  }
}

for (const mode of basenameModes) {
  for (const [mapping, mimeType] of Object.entries(mode.mappings)) {
    basenameMIMEMap.set(mapping, mimeType);
    mimeModeMap.set(mimeType, mode);
  }
}

function guessMimeType(contents: ReadonlyArray<string>) {
  const firstLine = contents[0];

  if (!firstLine) {
    return null;
  }

  if (firstLine.startsWith('<?xml')) {
    return 'text/xml';
  }

  if (firstLine.startsWith('#!')) {
    const match = /^#!.*?(ts-node|node|bash|sh|perl|python(?:[\d.]+)?)/.exec(firstLine);

    if (!match) {
      return null;
    }

    switch (match[1]) {
      case 'ts-node':
        return 'text/typescript';
      case 'node':
        return 'text/javascript';
      case 'sh':
      case 'bash':
        return 'text/x-sh';
      case 'perl':
        return 'text/x-perl';
    }

    const interpreter = match[1];
    return interpreter && interpreter.startsWith('python') ? 'text/x-python' : null;
  }

  return null;
}

async function detectMode(request: DiffHighlightRequest): Promise<CodeMirror.Mode<unknown> | null> {
  const mimeType =
    extensionMIMEMap.get(request.extension.toLowerCase()) ||
    basenameMIMEMap.get(request.basename.toLowerCase()) ||
    guessMimeType(request.contentLines);

  if (!mimeType) {
    return null;
  }

  const definition = mimeModeMap.get(mimeType);

  if (!definition) {
    return null;
  }

  await definition.install();

  return getMode({}, mimeType) || null;
}

function getModeName(mode: CodeMirror.Mode<unknown>): string | null {
  const maybeName = (mode as { name?: unknown }).name;

  return typeof maybeName === 'string' ? maybeName : null;
}

function getInnerModeName(mode: CodeMirror.Mode<unknown>, state: unknown): string | null {
  const inner = innerMode(mode, state);

  return inner?.mode ? getModeName(inner.mode) : null;
}

function readToken(
  mode: CodeMirror.Mode<unknown>,
  stream: CodeMirror.StringStream,
  state: unknown,
  addModeClass: boolean,
): string | null {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const innerModeName = addModeClass ? getInnerModeName(mode, state) : null;
    const token = mode.token(stream, state);

    if (stream.pos > stream.start) {
      return token && innerModeName ? `m-${innerModeName} ${token}` : token;
    }
  }

  throw new Error(`Mode ${getModeName(mode)} failed to advance stream.`);
}

self.onmessage = async (event: MessageEvent<DiffHighlightRequest>) => {
  const request = event.data;
  const tabSize = request.tabSize || 4;
  const addModeClass = request.addModeClass === true;
  const mode = await detectMode(request);

  if (!mode) {
    self.postMessage({} satisfies DiffHighlightResponse);
    return;
  }

  const lineFilter =
    request.lines && request.lines.length > 0
      ? new Set<number>(request.lines)
      : null;
  const maxLine = lineFilter ? Math.max(...lineFilter) : null;
  const lines = request.contentLines.concat();
  const state = mode.startState ? mode.startState() : null;
  const tokens: DiffHighlightResponse = {};
  const StringStreamConstructor = StringStream as unknown as new (
    line: string,
    tabSize?: number,
    lineOracle?: unknown,
  ) => CodeMirror.StringStream;

  for (const [lineIndex, line] of lines.entries()) {
    if (maxLine !== null && lineIndex > maxLine) {
      break;
    }

    if (lineFilter && !state && !lineFilter.has(lineIndex)) {
      continue;
    }

    if (line.length === 0) {
      mode.blankLine?.(state);
      continue;
    }

    const lineContext = {
      lines,
      line: lineIndex,
      lookAhead: (offset: number) => lines[lineIndex + offset],
    };
    const stream = new StringStreamConstructor(line, tabSize, lineContext);

    while (!stream.eol()) {
      const token = readToken(mode, stream, state, addModeClass);

      if (token && (!lineFilter || lineFilter.has(lineIndex))) {
        tokens[lineIndex] ??= {};
        tokens[lineIndex][stream.start] = {
          length: stream.pos - stream.start,
          token,
        };
      }

      stream.start = stream.pos;
    }
  }

  self.postMessage(tokens);
};
