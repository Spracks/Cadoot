/**
 * The Cadoot answer styles, one per option slot (up to MAX_OPTIONS). Each pairs
 * a distinct color WITH a distinct shape so the game stays readable for
 * colorblind players (never color alone). The first four are the classic set;
 * the rest only appear on questions with more options.
 */
export interface AnswerStyle {
  color: string;
  shape: string;
  name: string;
}

export const ANSWER_STYLES: AnswerStyle[] = [
  { color: '#e2434b', shape: '▲', name: 'red' },
  { color: '#1368ce', shape: '◆', name: 'blue' },
  { color: '#d89000', shape: '●', name: 'yellow' },
  { color: '#26890c', shape: '■', name: 'green' },
  { color: '#864cbf', shape: '★', name: 'purple' },
  { color: '#0e7c86', shape: '✚', name: 'teal' },
  // U+FE0E keeps phones from swapping the heart for a red emoji.
  { color: '#c0336f', shape: '♥︎', name: 'pink' },
  { color: '#a35200', shape: '▼', name: 'orange' },
];

export function answerStyle(index: number): AnswerStyle {
  return ANSWER_STYLES[index % ANSWER_STYLES.length]!;
}

/** True/False styling: green check for True (index 0), red cross for False. */
export const BOOLEAN_STYLES: AnswerStyle[] = [
  { color: '#26890c', shape: '✓', name: 'true' },
  { color: '#e2434b', shape: '✕', name: 'false' },
];

export function tileStyle(index: number, variant: 'multiple' | 'boolean') {
  return variant === 'boolean'
    ? BOOLEAN_STYLES[index % BOOLEAN_STYLES.length]!
    : answerStyle(index);
}
