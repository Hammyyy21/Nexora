import { useEffect, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';

interface Props {
  value: string;
  language: 'c' | 'assembly';
  readonly: boolean;
  onChange?: (value: string) => void;
  navigation?: { symbol: string; request: number };
}
export function CodeEditor({ value, language, readonly, onChange, navigation }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<editor.IStandaloneCodeEditor | null>(null);
  const props = useRef({ value, readonly, onChange });
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    props.current = { value, readonly, onChange };
  }, [value, readonly, onChange]);
  useEffect(() => {
    let disposed = false;
    let subscription: { dispose: () => void } | undefined;
    let model: editor.ITextModel | undefined;
    // A timeout offers recovery even if the lazy chunk never finishes loading.
    const timeout = setTimeout(() => {
      if (!disposed && !instance.current) setFailed(true);
    }, 12000);
    import('./monaco')
      .then(({ monaco }) => {
        if (disposed || !container.current) return;
        model = monaco.editor.createModel(
          props.current.value,
          language === 'c' ? 'c' : 'arm-assembly',
        );
        instance.current = monaco.editor.create(container.current, {
          model,
          theme: 'circuitforge',
          readOnly: props.current.readonly,
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 12,
          lineHeight: 20,
          scrollBeyondLastLine: false,
          padding: { top: 10 },
          lineNumbersMinChars: 3,
          folding: true,
          glyphMargin: false,
          wordWrap: 'off',
          tabSize: 4,
          autoIndent: 'full',
          matchBrackets: 'always',
          ariaLabel: language === 'c' ? 'C source editor' : 'ARM assembly viewer',
          contextmenu: true,
          fixedOverflowWidgets: true,
        });
        subscription = instance.current.onDidChangeModelContent(() =>
          props.current.onChange?.(instance.current!.getValue()),
        );
        clearTimeout(timeout);
        setLoading(false);
        setFailed(false);
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      subscription?.dispose();
      instance.current?.dispose();
      instance.current = null;
      model?.dispose();
    };
  }, [language, attempt]);
  useEffect(() => {
    if (instance.current && instance.current.getValue() !== value) {
      const model = instance.current.getModel();
      if (model)
        instance.current.executeEdits('external-source', [
          { range: model.getFullModelRange(), text: value },
        ]);
    }
  }, [value]);
  useEffect(() => {
    instance.current?.updateOptions({ readOnly: readonly });
  }, [readonly, loading]);
  useEffect(() => {
    if (!navigation || !instance.current) return;
    const model = instance.current.getModel();
    const match = model?.findMatches(
      `\\b${navigation.symbol}\\s*\\(`,
      false,
      true,
      true,
      null,
      false,
    )[0];
    if (match) {
      instance.current.revealLineInCenter(match.range.startLineNumber);
      instance.current.setSelection(match.range);
    }
  }, [navigation, loading]);
  return (
    <div className="firmware-editor">
      <div
        className="monaco-host"
        ref={container}
        style={{ visibility: failed ? 'hidden' : 'visible' }}
      />
      {loading && !failed && (
        <span className="editor-loading" role="status">
          Loading local code editor…
        </span>
      )}
      {failed && (
        <div className="editor-fallback">
          <p role="alert">
            Advanced editor unavailable. Plain-text editing and export still work.{' '}
            <button
              onClick={() => {
                setFailed(false);
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
            >
              Retry editor
            </button>
          </p>
          <textarea
            aria-label={language === 'c' ? 'C source fallback editor' : 'Assembly fallback viewer'}
            value={value}
            readOnly={readonly}
            spellCheck={false}
            onChange={(e) => onChange?.(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
