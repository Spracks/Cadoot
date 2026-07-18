/**
 * The four Cadoot answer styles. Each pairs a distinct color WITH a distinct
 * shape so the game stays readable for colorblind players (never color alone).
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
