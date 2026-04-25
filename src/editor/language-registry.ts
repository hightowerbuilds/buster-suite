import { extname } from "buster-path";
import type { Pos } from "./engine";

export type LanguageId = string;

export interface LanguageBracketPair {
  open: string;
  close: string;
}

export interface LanguageCommentTokens {
  line?: string;
  block?: { open: string; close: string };
}

export interface LanguageIndentationRules {
  increaseIndentPattern?: RegExp;
  decreaseIndentPattern?: RegExp;
}

export interface BuiltInSnippet {
  prefix: string;
  label: string;
  detail: string;
  expandWhen?: "blank-document";
  body: (indentUnit: string) => { text: string; cursor: Pos };
}

export interface LanguageDefinition {
  id: LanguageId;
  name: string;
  extensions: string[];
  aliases?: string[];
  comments?: LanguageCommentTokens;
  brackets: LanguageBracketPair[];
  autoClosePairs: LanguageBracketPair[];
  surroundingPairs: LanguageBracketPair[];
  indentation?: LanguageIndentationRules;
  snippets?: BuiltInSnippet[];
}

const COMMON_BRACKETS: LanguageBracketPair[] = [
  { open: "(", close: ")" },
  { open: "[", close: "]" },
  { open: "{", close: "}" },
];

const COMMON_AUTO_CLOSE: LanguageBracketPair[] = [
  ...COMMON_BRACKETS,
  { open: '"', close: '"' },
  { open: "'", close: "'" },
  { open: "`", close: "`" },
];

const COMMON_INDENTATION: LanguageIndentationRules = {
  increaseIndentPattern: /[{[(]\s*$/,
  decreaseIndentPattern: /^\s*[}\])]/,
};

function htmlBoilerplateSnippet(): BuiltInSnippet {
  return {
    prefix: "!",
    label: "HTML document",
    detail: "HTML5 boilerplate",
    expandWhen: "blank-document",
    body: (indentUnit) => ({
      text:
`<!DOCTYPE html>
<html lang="en">
<head>
${indentUnit}<meta charset="UTF-8">
${indentUnit}<meta name="viewport" content="width=device-width, initial-scale=1.0">
${indentUnit}<title>Document</title>
</head>
<body>
${indentUnit}
</body>
</html>`,
      cursor: { line: 8, col: indentUnit.length },
    }),
  };
}

function codeLanguage(
  id: LanguageId,
  name: string,
  extensions: string[],
  lineComment: string,
  extra?: Partial<LanguageDefinition>,
): LanguageDefinition {
  return {
    id,
    name,
    extensions,
    comments: { line: lineComment, block: { open: "/*", close: "*/" } },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
    indentation: COMMON_INDENTATION,
    ...extra,
  };
}

export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  {
    id: "html",
    name: "HTML",
    extensions: [".html", ".htm", ".xhtml"],
    aliases: ["html"],
    comments: { block: { open: "<!--", close: "-->" } },
    brackets: [
      ...COMMON_BRACKETS,
      { open: "<", close: ">" },
    ],
    autoClosePairs: [
      ...COMMON_AUTO_CLOSE,
      { open: "<", close: ">" },
    ],
    surroundingPairs: [
      ...COMMON_AUTO_CLOSE,
      { open: "<", close: ">" },
    ],
    indentation: {
      increaseIndentPattern: /<([A-Za-z][\w:-]*)(?:(?!<\/\1>).)*?>\s*$/,
      decreaseIndentPattern: /^\s*<\/[A-Za-z][\w:-]*>/,
    },
    snippets: [htmlBoilerplateSnippet()],
  },
  codeLanguage("javascript", "JavaScript", [".js", ".jsx", ".mjs", ".cjs"], "//"),
  codeLanguage("typescript", "TypeScript", [".ts", ".tsx", ".mts", ".cts"], "//"),
  {
    id: "css",
    name: "CSS",
    extensions: [".css", ".scss", ".sass", ".less"],
    comments: { block: { open: "/*", close: "*/" } },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
    indentation: COMMON_INDENTATION,
  },
  {
    id: "json",
    name: "JSON",
    extensions: [".json", ".jsonc"],
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
    indentation: COMMON_INDENTATION,
  },
  codeLanguage("rust", "Rust", [".rs"], "//"),
  {
    id: "python",
    name: "Python",
    extensions: [".py", ".pyw"],
    comments: { line: "#" },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
    indentation: {
      increaseIndentPattern: /:\s*(#.*)?$/,
      decreaseIndentPattern: /^\s*(elif|else|except|finally)\b/,
    },
  },
  codeLanguage("go", "Go", [".go"], "//"),
  codeLanguage("java", "Java", [".java"], "//"),
  codeLanguage("c", "C", [".c", ".h"], "//"),
  codeLanguage("cpp", "C++", [".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx"], "//"),
  codeLanguage("csharp", "C#", [".cs"], "//"),
  codeLanguage("php", "PHP", [".php"], "//", {
    comments: { line: "//", block: { open: "/*", close: "*/" } },
  }),
  {
    id: "ruby",
    name: "Ruby",
    extensions: [".rb"],
    comments: { line: "#" },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
    indentation: { increaseIndentPattern: /\b(do|def|class|module|if|unless|case|begin)\b.*$/ },
  },
  codeLanguage("swift", "Swift", [".swift"], "//"),
  codeLanguage("kotlin", "Kotlin", [".kt", ".kts"], "//"),
  codeLanguage("scala", "Scala", [".scala", ".sc"], "//"),
  {
    id: "shellscript",
    name: "Shell Script",
    extensions: [".sh", ".bash", ".zsh", ".fish"],
    aliases: ["shell", "bash", "zsh"],
    comments: { line: "#" },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
    indentation: { increaseIndentPattern: /\b(then|do|case)\s*$/ },
  },
  {
    id: "yaml",
    name: "YAML",
    extensions: [".yml", ".yaml"],
    comments: { line: "#" },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
  },
  {
    id: "toml",
    name: "TOML",
    extensions: [".toml"],
    comments: { line: "#" },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
  },
  {
    id: "markdown",
    name: "Markdown",
    extensions: [".md", ".markdown", ".mdx"],
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
  },
  {
    id: "sql",
    name: "SQL",
    extensions: [".sql"],
    comments: { line: "--", block: { open: "/*", close: "*/" } },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
  },
  codeLanguage("lua", "Lua", [".lua"], "--", {
    comments: { line: "--", block: { open: "--[[", close: "]]" } },
  }),
  codeLanguage("dart", "Dart", [".dart"], "//"),
  {
    id: "r",
    name: "R",
    extensions: [".r", ".R"],
    comments: { line: "#" },
    brackets: COMMON_BRACKETS,
    autoClosePairs: COMMON_AUTO_CLOSE,
    surroundingPairs: COMMON_AUTO_CLOSE,
    indentation: COMMON_INDENTATION,
  },
  codeLanguage("vue", "Vue", [".vue"], "//"),
  codeLanguage("svelte", "Svelte", [".svelte"], "//"),
];

const LANGUAGE_BY_ID = new Map(LANGUAGE_DEFINITIONS.map((language) => [language.id, language]));
const LANGUAGE_BY_EXTENSION = new Map<string, LanguageDefinition>();

for (const language of LANGUAGE_DEFINITIONS) {
  for (const extension of language.extensions) {
    LANGUAGE_BY_EXTENSION.set(extension.toLowerCase(), language);
  }
}

export function getLanguageDefinition(id: LanguageId | null): LanguageDefinition | null {
  if (!id) return null;
  return LANGUAGE_BY_ID.get(id) ?? null;
}

export function getLanguageDefinitionForPath(languagePath: string | null): LanguageDefinition | null {
  if (!languagePath) return null;
  const ext = extname(languagePath).toLowerCase();
  return LANGUAGE_BY_EXTENSION.get(ext) ?? null;
}

export function inferLanguageId(languagePath: string | null): LanguageId | null {
  return getLanguageDefinitionForPath(languagePath)?.id ?? null;
}

export function getAutoClosePairMap(languagePath: string | null): Record<string, string> {
  const language = getLanguageDefinitionForPath(languagePath);
  const pairs = language?.autoClosePairs ?? COMMON_AUTO_CLOSE;
  return Object.fromEntries(pairs.map((pair) => [pair.open, pair.close]));
}

export function getClosingPairSet(languagePath: string | null): Set<string> {
  const language = getLanguageDefinitionForPath(languagePath);
  const pairs = language?.autoClosePairs ?? COMMON_AUTO_CLOSE;
  return new Set(pairs.map((pair) => pair.close));
}
