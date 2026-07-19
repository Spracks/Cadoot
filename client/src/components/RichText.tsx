import { useMemo, Fragment, type ReactNode } from 'react';
import katex from 'katex';
import hljs from 'highlight.js/lib/common';

/**
 * Renders quiz text with opt-in code + math. Plain text is untouched, so
 * existing quizzes render exactly as before. Rich rendering only kicks in for:
 *   - fenced code blocks:  ```python … ```   (syntax-highlighted, block mode)
 *   - inline code:         `like this`
 *   - block math:          $$ \frac{a}{b} $$
 *   - inline math:         $x^2 + 1$
 *
 * KaTeX and highlight.js output is HTML we inject directly; both escape their
 * input, and quiz content is authored locally by the host, so this stays safe.
 * Plain-text segments are rendered as React children (auto-escaped).
 *
 * `inline` mode (used for short answer labels) skips block constructs.
 */
export default function RichText({
  text,
  inline = false,
}: {
  text: string;
  inline?: boolean;
}) {
  const nodes = useMemo(
    () => (inline ? renderInline(text) : renderBlock(text)),
    [text, inline],
  );
  if (inline) return <>{nodes}</>;
  return <div className="richtext">{nodes}</div>;
}

const FENCE_RE = /```([\w+#-]*)[ \t]*\r?\n?([\s\S]*?)```/g;
const INLINE_RE = /(\$\$[\s\S]+?\$\$)|(`[^`]+`)|(\$[^$\n]+?\$)/g;

/** Block rendering: split out fenced code, then handle inline constructs. */
function renderBlock(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(FENCE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...renderInline(text.slice(last, idx), key));
    key += 1000;
    out.push(
      <CodeBlock key={`cb${key}`} code={m[2] ?? ''} lang={m[1] || undefined} />,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(...renderInline(text.slice(last), key));
  return out;
}

/** Inline rendering: inline code, inline/block math, and plain text. */
function renderInline(text: string, base = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = base;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...textWithBreaks(text.slice(last, idx), key++));
    const tok = m[0];
    if (m[1]) out.push(<Math key={`mb${key++}`} src={tok.slice(2, -2)} display />);
    else if (m[2]) out.push(<code key={`ic${key++}`} className="code-inline">{tok.slice(1, -1)}</code>);
    else out.push(<Math key={`mi${key++}`} src={tok.slice(1, -1)} />);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(...textWithBreaks(text.slice(last), key));
  return out;
}

/** Plain text, preserving author line breaks. */
function textWithBreaks(text: string, key: number): ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <Fragment key={`t${key}-${i}`}>
      {line}
      {i < lines.length - 1 && <br />}
    </Fragment>
  ));
}

function Math({ src, display = false }: { src: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(src, {
        displayMode: display,
        throwOnError: false,
        output: 'html',
      });
    } catch {
      return escapeHtml(src);
    }
  }, [src, display]);
  return (
    <span
      className={display ? 'math-block' : 'math-inline'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const html = useMemo(() => {
    const src = code.replace(/\n$/, '');
    try {
      return lang && hljs.getLanguage(lang)
        ? hljs.highlight(src, { language: lang }).value
        : hljs.highlightAuto(src).value;
    } catch {
      return escapeHtml(src);
    }
  }, [code, lang]);
  return (
    <pre className="code-block">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
