import { readFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { parseQuizByFilename, type Question } from '@cadoot/shared';

/** One line summing up a question's answer, for a quick eyeball check. */
function answerKey(q: Question): string {
  switch (q.type) {
    case 'multiple':
    case 'boolean':
      return `correct: "${q.options[q.correctIndex]}"`;
    case 'fill':
      return `accepts: ${q.answers.map((a) => `"${a}"`).join(', ')}`;
    case 'open':
      return 'open-ended (not scored)';
    case 'puzzle':
      return `pairs: ${q.pairs.map((p) => `"${p.left}" = "${p.right}"`).join(', ')}`;
  }
}

/**
 * CLI: validate a quiz file before class.
 *   npm run validate-quiz -- path/to/quiz.json
 *   npm run validate-quiz -- path/to/quiz.csv
 */
function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npm run validate-quiz -- <path-to-quiz.json|.csv>');
    process.exit(2);
    return;
  }

  // npm runs this script with cwd set to the workspace; INIT_CWD is the
  // directory the user actually invoked npm from (usually the repo root).
  const base = process.env.INIT_CWD ?? process.cwd();
  const file = isAbsolute(arg) ? arg : resolve(base, arg);

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`Could not read ${file}: ${(err as Error).message}`);
    process.exit(2);
    return;
  }

  const result = parseQuizByFilename(basename(file), text);
  if (result.ok) {
    const { quiz } = result;
    console.log(`✅  "${quiz.title}" is valid.`);
    console.log(`    ${quiz.questions.length} question(s).`);
    quiz.questions.forEach((q, i) => {
      console.log(`    ${i + 1}. ${q.text}  ->  ${answerKey(q)} (${q.timeLimitSec}s)`);
    });
    process.exit(0);
  } else {
    console.error(`❌  ${file} is not valid:`);
    for (const e of result.errors) console.error(`    - ${e}`);
    process.exit(1);
  }
}

main();
