/// <reference lib="webworker" />

import {
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
} from 'shiki/bundle/full';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

import {
  type DiffHighlightRequest,
  type DiffHighlightResponse,
} from '@/lib/diff/highlighter-types';
import { detectDiffHighlightLanguage, DIFF_SYNTAX_TOKEN_CLASS } from '@/lib/diff/shiki-support';

const DARK_THEME = 'github-dark' satisfies BundledTheme;
const loadedLanguages = new Set<string>();
const highlighterPromise = createHighlighter({
  langs: [],
  themes: [DARK_THEME],
  engine: createJavaScriptRegexEngine(),
});
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;
const FONT_STYLE_STRIKETHROUGH = 8;

function toShikiHtmlStyle(
  token: ReturnType<Awaited<typeof highlighterPromise>['codeToTokens']>['tokens'][number][number],
) {
  const style: Record<string, string> = token.htmlStyle ? { ...token.htmlStyle } : {};

  if (token.color) {
    style.color = token.color;
  }

  if (token.bgColor) {
    style['background-color'] = token.bgColor;
  }

  if (token.fontStyle !== undefined && token.fontStyle > 0) {
    if (token.fontStyle & FONT_STYLE_ITALIC) {
      style['font-style'] = 'italic';
    }

    if (token.fontStyle & FONT_STYLE_BOLD) {
      style['font-weight'] = '700';
    }

    const decorations: string[] = [];

    if (token.fontStyle & FONT_STYLE_UNDERLINE) {
      decorations.push('underline');
    }

    if (token.fontStyle & FONT_STYLE_STRIKETHROUGH) {
      decorations.push('line-through');
    }

    if (decorations.length > 0) {
      style['text-decoration-line'] = decorations.join(' ');
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

async function ensureLanguageLoaded(languageName: string) {
  const highlighter = await highlighterPromise;
  const resolvedLanguage = highlighter.resolveLangAlias(languageName);

  if (!loadedLanguages.has(resolvedLanguage)) {
    await highlighter.loadLanguage(resolvedLanguage as BundledLanguage);
    loadedLanguages.add(resolvedLanguage);
  }

  return { highlighter, language: resolvedLanguage as BundledLanguage };
}

function toHighlightResponse(
  request: DiffHighlightRequest,
  language: BundledLanguage,
  lineFilter: Set<number> | null,
  maxLine: number | null,
  highlighter: Awaited<typeof highlighterPromise>,
) {
  const tokens: DiffHighlightResponse = {};
  let grammarState:
    | ReturnType<typeof highlighter.codeToTokens>['grammarState']
    | undefined;

  for (const [lineIndex, line] of request.contentLines.entries()) {
    if (maxLine !== null && lineIndex > maxLine) {
      break;
    }

    const highlightedLine = highlighter.codeToTokens(line, {
      lang: language,
      theme: DARK_THEME,
      ...(grammarState ? { grammarState } : {}),
    });

    grammarState = highlightedLine.grammarState;

    if (lineFilter && !lineFilter.has(lineIndex)) {
      continue;
    }

    const lineTokens = highlightedLine.tokens[0] ?? [];

    for (const token of lineTokens) {
      if (token.content.length === 0) {
        continue;
      }

      const htmlStyle = toShikiHtmlStyle(token);

      tokens[lineIndex] ??= {};
      tokens[lineIndex][token.offset] = {
        length: token.content.length,
        token: DIFF_SYNTAX_TOKEN_CLASS,
        ...(htmlStyle ? { htmlStyle } : {}),
      };
    }
  }

  return tokens;
}

self.onmessage = async (event: MessageEvent<DiffHighlightRequest>) => {
  const request = event.data;

  if (request.contentLines.length === 0 || request.lines?.length === 0) {
    self.postMessage({} satisfies DiffHighlightResponse);
    return;
  }

  const languageName = detectDiffHighlightLanguage({
    basename: request.basename,
    extension: request.extension,
    contentLines: request.contentLines,
  });

  if (!languageName) {
    self.postMessage({} satisfies DiffHighlightResponse);
    return;
  }

  const { highlighter, language } = await ensureLanguageLoaded(languageName);
  const lineFilter =
    request.lines && request.lines.length > 0
      ? new Set<number>(request.lines)
      : null;
  const maxLine = lineFilter ? Math.max(...lineFilter) : null;
  const response = toHighlightResponse(request, language, lineFilter, maxLine, highlighter);

  self.postMessage(response);
};
