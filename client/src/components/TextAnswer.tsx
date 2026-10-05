import { useState, type FormEvent } from 'react';
import { MAX_TEXT_ANSWER } from '@cadoot/shared';

/** A one-line typed answer, for fill-in-the-blank and open-ended questions. */
export default function TextAnswer({
  onSubmit,
  placeholder,
}: {
  onSubmit: (text: string) => void;
  placeholder: string;
}) {
  const [text, setText] = useState('');
  const trimmed = text.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form className="text-answer" onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={MAX_TEXT_ANSWER}
        aria-label="Your answer"
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
      />
      <button className="btn primary" type="submit" disabled={!trimmed}>
        Submit
      </button>
    </form>
  );
}
