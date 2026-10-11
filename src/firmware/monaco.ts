import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.languages.register({ id: 'arm-assembly' });
monaco.languages.setMonarchTokensProvider('arm-assembly', {
  tokenizer: {
    root: [
      [/@.*$/, 'comment'],
      [/^\s*[\w.$]+:/, 'type.identifier'],
      [/\.[a-z_]+/, 'keyword'],
      [/\b(?:r\d+|lr|sp|pc)\b/, 'variable'],
      [/\b(?:ldr|str|bx|movs?|movgt|cmp|it|push|pop|bl|b)\b/, 'keyword'],
      [/#?-?(?:0x[\da-fA-F]+|\d+)/, 'number'],
      [/".*?"/, 'string'],
    ],
  },
});
monaco.editor.defineTheme('nexora', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '7891AC' },
    { token: 'keyword', foreground: '85ABFF' },
    { token: 'number', foreground: '65D6CB' },
  ],
  colors: {
    'editor.background': '#101827',
    'editor.foreground': '#E8F0FF',
    'editorLineNumber.foreground': '#536883',
    'editor.lineHighlightBackground': '#172338',
    'editor.selectionBackground': '#284573',
    'editorCursor.foreground': '#30D7E8',
  },
});
export { monaco };
