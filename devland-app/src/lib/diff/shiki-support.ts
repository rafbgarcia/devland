import {
  bundledLanguagesAlias,
  bundledLanguagesInfo,
} from 'shiki/bundle/full';

export const DIFF_SYNTAX_TOKEN_CLASS = 'diff-syntax-token';

const supportedLanguageNames = new Set<string>([
  ...Object.keys(bundledLanguagesAlias),
  ...bundledLanguagesInfo.map((language) => language.id),
]);

const extensionLanguageMap: Readonly<Record<string, string>> = {
  '.htm': 'html',
  '.aspx': 'html',
  '.cshtml': 'razor',
  '.jsp': 'html',
  '.xaml': 'xml',
  '.csproj': 'xml',
  '.fsproj': 'xml',
  '.vcxproj': 'xml',
  '.vbproj': 'xml',
  '.svg': 'xml',
  '.resx': 'xml',
  '.props': 'xml',
  '.targets': 'xml',
  '.patch': 'diff',
  '.m': 'objc',
  '.cake': 'cs',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.cxx': 'cpp',
  '.ino': 'cpp',
  '.kt': 'kotlin',
  '.ml': 'ocaml',
  '.pyi': 'python',
  '.vpy': 'python',
  '.edn': 'clojure',
  '.tex': 'latex',
};

const basenameLanguageMap: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  'cargo.lock': 'toml',
  '.gitattributes': 'properties',
  '.gitignore': 'properties',
  '.editorconfig': 'ini',
  'cmakelists.txt': 'cmake',
};

function isSupportedLanguageName(languageName: string) {
  return supportedLanguageNames.has(languageName);
}

function guessLanguageFromContents(contentLines: ReadonlyArray<string>) {
  const firstLine = contentLines[0];

  if (!firstLine) {
    return null;
  }

  if (firstLine.startsWith('<?xml')) {
    return 'xml';
  }

  if (firstLine.startsWith('#!')) {
    const match = /^#!.*?(ts-node|node|bash|sh|perl|python(?:[\d.]+)?)/.exec(firstLine);

    if (!match) {
      return null;
    }

    const interpreter = match[1];

    switch (interpreter) {
      case 'ts-node':
        return 'ts';
      case 'node':
        return 'js';
      case 'sh':
      case 'bash':
        return 'sh';
      case 'perl':
        return 'perl';
      default:
        return interpreter !== undefined && interpreter.startsWith('python') ? 'python' : null;
    }
  }

  return null;
}

export function detectDiffHighlightLanguage({
  basename,
  extension,
  contentLines,
}: {
  basename: string;
  extension: string;
  contentLines: ReadonlyArray<string>;
}) {
  const normalizedBasename = basename.toLowerCase();
  const normalizedExtension = extension.toLowerCase();
  const directExtensionLanguage = normalizedExtension.startsWith('.')
    ? normalizedExtension.slice(1)
    : normalizedExtension;

  return (
    basenameLanguageMap[normalizedBasename] ??
    extensionLanguageMap[normalizedExtension] ??
    (directExtensionLanguage && isSupportedLanguageName(directExtensionLanguage)
      ? directExtensionLanguage
      : null) ??
    (normalizedBasename && isSupportedLanguageName(normalizedBasename) ? normalizedBasename : null) ??
    guessLanguageFromContents(contentLines)
  );
}
