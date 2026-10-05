import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_OPEN_ANSWER, MAX_TEXT_ANSWER } from '@cadoot/shared';

/**
 * A typed answer. One line for fill-in-the-blank; a roomy multi-line box with
 * a character counter (`multiline`) for open-ended questions.
 */
export default function TextAnswer({
  onSubmit,
  placeholder,
  multiline = false,
}: {
  onSubmit: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const max = multiline ? MAX_OPEN_ANSWER : MAX_TEXT_ANSWER;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (trimmed) onSubmit(trimmed);
  }

  // In the multi-line box Enter starts a new line, so Ctrl/⌘+Enter submits.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
  }

  return (
    <form className={`text-answer${multiline ? ' multiline' : ''}`} onSubmit={submit}>
      {multiline ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            maxLength={max}
            rows={6}
            aria-label="Your answer"
            aria-describedby="answer-count"
            autoFocus
          />
          <span
            id="answer-count"
            className={`text-answer-count${text.length >= max ? ' full' : ''}`}
          >
            {text.length} / {max}
          </span>
        </>
      ) : (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={max}
          aria-label="Your answer"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
        />
      )}
      <button className="btn primary" type="submit" disabled={!trimmed}>
        Submit
      </button>
    </form>
  );
}
