import type { HostReport, PersonalReview, QuestionStat } from '@cadoot/shared';

/**
 * Turns a finished game into files you can keep: a printable HTML sheet and a
 * CSV of the same content.
 *
 * Everything here is built in the browser from data the server already sent —
 * no upload, no round trip — which keeps the app's "nothing leaves your
 * network" promise intact even though results now outlive the game.
 *
 * The HTML is deliberately self-contained (inline CSS, no fonts, no scripts) so
 * it opens offline months later from a phone's Downloads folder.
 */

const LETTERS = ['A', 'B', 'C', 'D'];

/* ------------------------------------------------------------------ *
 * Downloading
 * ------------------------------------------------------------------ */

/**
 * Save `content` as a file. Anchors are appended to the document and revoked on
 * a later tick — clicking a detached anchor and revoking the URL synchronously
 * both silently fail on some mobile browsers, and phones are the whole point.
 */
export function downloadFile(
  filename: string,
  mime: string,
  content: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A filename-safe slice of arbitrary text (quiz titles, nicknames). */
export function slug(text: string, fallback = 'cadoot'): string {
  const cleaned = text
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return cleaned || fallback;
}

export function studySheetName(review: PersonalReview, ext: string): string {
  return `${slug(review.quizTitle, 'quiz')}-${slug(review.nickname, 'results')}-results.${ext}`;
}

export function classReportName(report: HostReport, ext: string): string {
  return `${slug(report.quizTitle, 'quiz')}-class-report.${ext}`;
}

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * One CSV cell. Numbers go through bare so spreadsheets treat them as numbers;
 * text is always quoted, and text that opens with a formula character gets a
 * leading apostrophe — nicknames are free-form, and Excel will happily execute
 * a cell that starts with `=`.
 */
function cell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function csvRow(cells: Array<string | number>): string {
  return cells.map(cell).join(',');
}

const FENCE_RE = /```([\w+#-]*)[ \t]*\r?\n?([\s\S]*?)```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/**
 * Question text as HTML, with the two constructs that would otherwise read as
 * noise turned into real markup: fenced code blocks and inline code.
 *
 * Math (`$x^2$`) is deliberately left as source. Rendering it means shipping
 * KaTeX's font files, and a study sheet you can email to yourself is worth more
 * than a typeset one that breaks the moment it leaves the browser.
 */
function questionHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(FENCE_RE)) {
    const idx = m.index ?? 0;
    // The container preserves newlines, so drop the ones the fence itself sat
    // on — otherwise every code block gains a blank line above and below.
    out += inlineHtml(text.slice(last, idx).replace(/\n+$/, ''));
    out += `<pre class="code">${esc((m[2] ?? '').replace(/\n+$/, ''))}</pre>`;
    last = idx + m[0].length;
  }
  out += inlineHtml(text.slice(last).replace(/^\n+/, ''));
  return out;
}

/** Inline code inside a run of plain text. Everything else is escaped as-is. */
function inlineHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(INLINE_CODE_RE)) {
    const idx = m.index ?? 0;
    out += esc(text.slice(last, idx));
    out += `<code>${esc(m[1] ?? '')}</code>`;
    last = idx + m[0].length;
  }
  return out + esc(text.slice(last));
}

/**
 * Question text flattened to a single line of prose, for spreadsheet cells and
 * the report's summary rows. Code fences and backticks are markup, not content,
 * so they come out rather than cluttering the cell.
 */
function oneLine(text: string): string {
  return text
    .replace(FENCE_RE, ' $2 ')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Excel on Windows reads a BOM-less UTF-8 CSV as the local codepage, which
 * mangles accented names and emoji. The BOM costs nothing elsewhere.
 */
const BOM = '﻿';

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** How an answer turned out, for the CSV `result` column. */
function outcome(correct: boolean, answered: boolean): string {
  if (!answered) return 'no answer';
  return correct ? 'correct' : 'wrong';
}

/* ------------------------------------------------------------------ *
 * Shared page chrome
 * ------------------------------------------------------------------ */

/** Print-first styling: dark ink on white, and no question split across pages. */
const PAGE_CSS = `
  :root { --ink:#1f1147; --muted:#6b6b80; --good:#26890c; --bad:#e2434b;
          --line:#e4e2ee; --brand:#46178f; }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 20px 56px; background:#f6f5fa; color:var(--ink);
         font-family:'Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;
         line-height:1.45; }
  main { max-width:800px; margin:0 auto; }
  header { border-bottom:4px solid var(--brand); padding-bottom:16px; margin-bottom:28px; }
  .brand { margin:0; font-size:.8rem; font-weight:800; letter-spacing:.14em;
           text-transform:uppercase; color:var(--brand); }
  h1 { margin:6px 0 10px; font-size:1.9rem; }
  .meta { margin:0; color:var(--muted); font-size:.95rem; }
  .meta strong { color:var(--ink); }
  h2 { font-size:1.15rem; margin:34px 0 12px; }
  ol.questions { list-style:none; padding:0; margin:0; }
  .q { background:#fff; border:1px solid var(--line); border-left:6px solid var(--muted);
       border-radius:10px; padding:16px 18px; margin-bottom:14px;
       break-inside:avoid; page-break-inside:avoid; }
  .q.correct { border-left-color:var(--good); }
  .q.wrong { border-left-color:var(--bad); }
  .q-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
            font-size:.85rem; margin-bottom:8px; }
  .q-num { font-weight:800; letter-spacing:.05em; color:var(--muted); }
  .verdict { font-weight:700; }
  .correct .verdict { color:var(--good); }
  .wrong .verdict { color:var(--bad); }
  .pts { margin-left:auto; color:var(--muted); }
  .q-text { font-size:1.08rem; font-weight:600; white-space:pre-wrap; margin-bottom:12px; }
  code, pre.code { font-family:'Cascadia Code',Consolas,'Courier New',monospace; }
  code { background:#efedf6; border-radius:4px; padding:1px 5px; font-size:.92em; }
  pre.code { white-space:pre; overflow-x:auto; background:#f4f3f9; border:1px solid var(--line);
             border-radius:8px; padding:11px 13px; margin:10px 0; font-size:.9rem;
             font-weight:400; line-height:1.45; }
  ul.options { list-style:none; padding:0; margin:0; }
  .opt { display:flex; gap:10px; align-items:baseline; padding:7px 10px;
         border-radius:7px; border:1px solid transparent; }
  .opt .letter { font-weight:800; color:var(--muted); min-width:1.2em; }
  .opt .text { white-space:pre-wrap; }
  .opt .tag { margin-left:auto; padding-left:12px; font-size:.78rem; font-weight:700;
              white-space:nowrap; color:var(--muted); }
  .opt.is-correct { background:#e8f6e4; border-color:#bfe3b4; }
  .opt.is-correct .tag { color:var(--good); }
  .opt.is-mine:not(.is-correct) { background:#fdeaeb; border-color:#f5c3c6; }
  .opt.is-mine:not(.is-correct) .tag { color:var(--bad); }
  .missed { margin:10px 0 0; font-size:.85rem; color:var(--bad); font-weight:600; }
  table { width:100%; border-collapse:collapse; background:#fff;
          border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th, td { padding:9px 12px; text-align:left; border-bottom:1px solid var(--line);
           font-size:.92rem; }
  th { background:#efedf6; font-size:.76rem; text-transform:uppercase;
       letter-spacing:.07em; color:var(--muted); }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  tr:last-child td { border-bottom:none; }
  .bar { min-width:130px; }
  .bar .row { display:flex; align-items:center; gap:9px; }
  .bar .track { flex:1; height:9px; border-radius:5px; background:var(--line); min-width:56px; }
  .bar .track span { display:block; height:100%; border-radius:5px; background:var(--good); }
  .bar .pct { font-variant-numeric:tabular-nums; font-weight:600; min-width:3em;
              text-align:right; }
  .bar.low .track span { background:var(--bad); }
  .bar.mid .track span { background:#e0a672; }
  footer { max-width:800px; margin:36px auto 0; color:var(--muted); font-size:.82rem;
           border-top:1px solid var(--line); padding-top:14px; }
  @media print {
    body { background:#fff; padding:0; }
    .q, table { border-color:#ccc; }
  }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
${body}
</main>
<footer>
Generated by Cadoot on this device — nothing was uploaded. Print this page or
save it as a PDF to keep it.
</footer>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * Student study sheet
 * ------------------------------------------------------------------ */

export function studySheetHtml(review: PersonalReview): string {
  const total = review.answers.length;
  const heading = `${review.quizTitle} — ${review.nickname}`;

  const questions = review.answers
    .map((a) => {
      const answered = a.answerIndex !== null;
      const options = a.options
        .map((opt, i) => {
          const isCorrect = i === a.correctIndex;
          const isMine = i === a.answerIndex;
          const classes = ['opt'];
          if (isCorrect) classes.push('is-correct');
          if (isMine) classes.push('is-mine');
          const tags: string[] = [];
          if (isCorrect) tags.push('correct answer');
          if (isMine) tags.push('your answer');
          return `      <li class="${classes.join(' ')}">
        <span class="letter">${LETTERS[i] ?? i + 1}</span>
        <span class="text">${inlineHtml(opt)}</span>
        ${tags.length ? `<span class="tag">${tags.join(' · ')}</span>` : ''}
      </li>`;
        })
        .join('\n');

      return `  <li class="q ${a.correct ? 'correct' : 'wrong'}">
    <div class="q-head">
      <span class="q-num">Q${a.questionIndex + 1}</span>
      <span class="verdict">${a.correct ? '✓ Correct' : answered ? '✗ Incorrect' : '✗ No answer'}</span>
      <span class="pts">+${a.pointsEarned} pts</span>
    </div>
    <div class="q-text">${questionHtml(a.text)}</div>
    <ul class="options">
${options}
    </ul>
${!answered ? '    <p class="missed">You ran out of time on this one.</p>' : ''}
  </li>`;
    })
    .join('\n');

  return page(
    heading,
    `<header>
  <p class="brand">Cadoot · study sheet</p>
  <h1>${esc(review.quizTitle)}</h1>
  <p class="meta">
    <strong>${esc(review.nickname)}</strong> ·
    <strong>${review.correctCount} of ${total}</strong> correct ·
    ${review.score} pts ·
    rank ${review.rank} of ${review.totalPlayers} ·
    ${esc(formatDate(review.finishedAt))}
  </p>
</header>
<ol class="questions">
${questions}
</ol>`,
  );
}

export function studySheetCsv(review: PersonalReview): string {
  const rows = [
    csvRow([
      'question_number',
      'question',
      'your_answer',
      'correct_answer',
      'result',
      'points_earned',
    ]),
    ...review.answers.map((a) =>
      csvRow([
        a.questionIndex + 1,
        oneLine(a.text),
        a.answerIndex === null ? '' : oneLine(a.options[a.answerIndex] ?? ''),
        oneLine(a.options[a.correctIndex] ?? ''),
        outcome(a.correct, a.answerIndex !== null),
        a.pointsEarned,
      ]),
    ),
  ];
  return BOM + rows.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ *
 * Host class report
 * ------------------------------------------------------------------ */

function accuracyPercent(q: QuestionStat): number {
  return Math.round(q.accuracy * 100);
}

export function classReportHtml(report: HostReport): string {
  const standings = report.standings
    .map(
      (row) => `    <tr>
      <td class="num">${row.rank}</td>
      <td>${esc(row.nickname)}</td>
      <td class="num">${row.score}</td>
      <td class="num">${row.correctCount}</td>
    </tr>`,
    )
    .join('\n');

  // Weakest questions first — the point of the report is spotting what to
  // reteach, not replaying the game in order.
  const byAccuracy = [...report.questions].sort((a, b) => a.accuracy - b.accuracy);

  const questions = byAccuracy
    .map((q) => {
      const pct = accuracyPercent(q);
      const band = pct < 50 ? 'low' : pct < 75 ? 'mid' : '';
      const breakdown = q.options
        .map((opt, i) => {
          const count = q.distribution[i] ?? 0;
          const mark = i === q.correctIndex ? ' ✓' : '';
          return `${LETTERS[i] ?? i + 1}. ${esc(opt)}${mark} — ${count}`;
        })
        .concat(q.noAnswerCount > 0 ? [`No answer — ${q.noAnswerCount}`] : [])
        .join('<br>');
      return `    <tr>
      <td class="num">${q.questionIndex + 1}</td>
      <td>
        <strong>${esc(oneLine(q.text))}</strong><br>
        <span style="color:var(--muted);font-size:.85rem">${breakdown}</span>
      </td>
      <td class="num">${q.correctCount}/${report.playerCount}</td>
      <td class="bar ${band}">
        <div class="row">
          <span class="track"><span style="width:${pct}%"></span></span>
          <span class="pct">${pct}%</span>
        </div>
      </td>
    </tr>`;
    })
    .join('\n');

  return page(
    `${report.quizTitle} — class report`,
    `<header>
  <p class="brand">Cadoot · class report</p>
  <h1>${esc(report.quizTitle)}</h1>
  <p class="meta">
    <strong>${report.playerCount}</strong> ${report.playerCount === 1 ? 'player' : 'players'} ·
    <strong>${report.questions.length}</strong> ${report.questions.length === 1 ? 'question' : 'questions'} ·
    ${esc(formatDate(report.finishedAt))}
  </p>
</header>

<h2>Question accuracy — hardest first</h2>
<table>
  <thead>
    <tr><th class="num">#</th><th>Question</th><th class="num">Correct</th><th>Accuracy</th></tr>
  </thead>
  <tbody>
${questions}
  </tbody>
</table>

<h2>Final standings</h2>
<table>
  <thead>
    <tr><th class="num">Rank</th><th>Player</th><th class="num">Score</th><th class="num">Correct</th></tr>
  </thead>
  <tbody>
${standings}
  </tbody>
</table>`,
  );
}

/**
 * Two stacked tables in one file. Spreadsheets show this as standings, a blank
 * row, then the question breakdown — which beats making the host juggle two
 * downloads.
 */
export function classReportCsv(report: HostReport): string {
  const optionColumns = Math.max(
    0,
    ...report.questions.map((q) => q.options.length),
  );

  const standings = [
    csvRow(['Final standings']),
    csvRow(['rank', 'nickname', 'score', 'correct_answers']),
    ...report.standings.map((r) =>
      csvRow([r.rank, r.nickname, r.score, r.correctCount]),
    ),
  ];

  const questions = [
    csvRow(['Question accuracy']),
    csvRow([
      'question_number',
      'question',
      'correct_answer',
      'correct_count',
      'incorrect_count',
      'no_answer_count',
      'accuracy_percent',
      ...LETTERS.slice(0, optionColumns).map(
        (l) => `option_${l.toLowerCase()}_count`,
      ),
    ]),
    ...report.questions.map((q) => {
      const answered = q.distribution.reduce((sum, n) => sum + n, 0);
      return csvRow([
        q.questionIndex + 1,
        oneLine(q.text),
        oneLine(q.options[q.correctIndex] ?? ''),
        q.correctCount,
        answered - q.correctCount,
        q.noAnswerCount,
        accuracyPercent(q),
        ...Array.from(
          { length: optionColumns },
          (_, i) => q.distribution[i] ?? 0,
        ),
      ]);
    }),
  ];

  return BOM + [...standings, '', ...questions].join('\r\n') + '\r\n';
}
