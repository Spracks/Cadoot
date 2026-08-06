import { describe, it, expect } from 'vitest';
import type { HostReport, PersonalReview } from '@cadoot/shared';
import {
  classReportCsv,
  classReportHtml,
  classReportName,
  slug,
  studySheetCsv,
  studySheetHtml,
  studySheetName,
} from './results';

const REVIEW: PersonalReview = {
  quizTitle: 'Cell Biology',
  finishedAt: Date.UTC(2026, 7, 6, 15, 30),
  nickname: 'Ava',
  rank: 2,
  totalPlayers: 3,
  score: 1400,
  correctCount: 1,
  answers: [
    {
      questionIndex: 0,
      text: 'Which organelle makes ATP?',
      options: ['Ribosome', 'Mitochondrion', 'Golgi body', 'Nucleus'],
      correctIndex: 1,
      answerIndex: 1,
      correct: true,
      pointsEarned: 1000,
    },
    {
      questionIndex: 1,
      text: 'DNA replication is…',
      options: ['Conservative', 'Semi-conservative'],
      correctIndex: 1,
      answerIndex: 0,
      correct: false,
      pointsEarned: 0,
    },
    {
      questionIndex: 2,
      text: 'Enzymes are made of…',
      options: ['Lipid', 'Protein'],
      correctIndex: 1,
      answerIndex: null,
      correct: false,
      pointsEarned: 0,
    },
  ],
};

const REPORT: HostReport = {
  quizTitle: 'Cell Biology',
  finishedAt: Date.UTC(2026, 7, 6, 15, 30),
  playerCount: 4,
  standings: [
    { rank: 1, nickname: 'Ben', score: 2100, correctCount: 3 },
    { rank: 2, nickname: 'Ava', score: 1400, correctCount: 1 },
  ],
  questions: [
    {
      questionIndex: 0,
      text: 'Which organelle makes ATP?',
      options: ['Ribosome', 'Mitochondrion', 'Golgi body', 'Nucleus'],
      correctIndex: 1,
      distribution: [1, 3, 0, 0],
      correctCount: 3,
      noAnswerCount: 0,
      accuracy: 0.75,
    },
    {
      questionIndex: 1,
      text: 'DNA replication is…',
      options: ['Conservative', 'Semi-conservative'],
      correctIndex: 1,
      distribution: [2, 1],
      correctCount: 1,
      noAnswerCount: 1,
      accuracy: 0.25,
    },
  ],
};

describe('study sheet', () => {
  it('marks the correct answer and the player’s own answer on every question', () => {
    const html = studySheetHtml(REVIEW);

    // Q1: one option is both correct and theirs.
    expect(html).toContain('is-correct is-mine');
    expect(html).toContain('correct answer · your answer');
    // Q2: their pick and the right answer are different options.
    expect(html).toMatch(/is-mine[^]*?Conservative/);
    expect(html).toContain('✗ Incorrect');
    // Q3: never answered.
    expect(html).toContain('✗ No answer');
    expect(html).toContain('You ran out of time');
  });

  it('carries the player’s own summary, not the whole class', () => {
    const html = studySheetHtml(REVIEW);
    expect(html).toContain('Ava');
    expect(html).toContain('1 of 3');
    expect(html).toContain('rank 2 of 3');
    expect(html).not.toContain('Ben');
  });

  it('escapes text that would otherwise inject markup', () => {
    const html = studySheetHtml({
      ...REVIEW,
      nickname: '<img src=x onerror=alert(1)>',
      answers: [
        { ...REVIEW.answers[0]!, text: 'Is 1 < 2 & 3 > 2?', options: ['<b>yes</b>', 'no'] },
      ],
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>yes</b>');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 2');
  });

  it('exports one CSV row per question with the outcome spelled out', () => {
    const lines = studySheetCsv(REVIEW).trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      '"question_number","question","your_answer","correct_answer","result","points_earned"',
    );
    expect(lines[1]).toBe(
      '1,"Which organelle makes ATP?","Mitochondrion","Mitochondrion","correct",1000',
    );
    expect(lines[2]).toBe(
      '2,"DNA replication is…","Conservative","Semi-conservative","wrong",0',
    );
    // Unanswered: blank answer, and the outcome says so rather than "wrong".
    expect(lines[3]).toBe('3,"Enzymes are made of…","","Protein","no answer",0');
  });

  it('neutralises spreadsheet formulas and escapes quotes in CSV cells', () => {
    const csv = studySheetCsv({
      ...REVIEW,
      answers: [
        {
          ...REVIEW.answers[0]!,
          text: '=cmd|calc',
          options: ['He said "hi"', 'b'],
          correctIndex: 0,
          answerIndex: 0,
        },
      ],
    });
    expect(csv).toContain(`"'=cmd|calc"`);
    expect(csv).toContain('"He said ""hi"""');
  });

  it('renders fenced and inline code rather than leaving backticks on the page', () => {
    const html = studySheetHtml({
      ...REVIEW,
      answers: [
        {
          ...REVIEW.answers[0]!,
          text: 'What does this print?\n\n```python\nprint(len("cell"))\n```',
          options: ['Calls `len()`', 'b'],
        },
      ],
    });
    expect(html).toContain('<pre class="code">print(len(&quot;cell&quot;))</pre>');
    expect(html).toContain('Calls <code>len()</code>');
    // The fence markers and the language tag are markup, not content.
    expect(html).not.toContain('```');
    expect(html).not.toContain('python');
  });

  it('collapses multi-line question text onto one CSV line', () => {
    const csv = studySheetCsv({
      ...REVIEW,
      answers: [{ ...REVIEW.answers[0]!, text: 'What does\nthis print?' }],
    });
    expect(csv).toContain('"What does this print?"');
    expect(csv.trim().split('\r\n')).toHaveLength(2);
  });

  it('strips code fences from spreadsheet cells, keeping the code itself', () => {
    const csv = studySheetCsv({
      ...REVIEW,
      answers: [
        {
          ...REVIEW.answers[0]!,
          text: 'Output?\n\n```python\nprint(1)\n```',
          options: ['`1`', 'b'],
          correctIndex: 0,
          answerIndex: 0,
        },
      ],
    });
    expect(csv).toContain('"Output? print(1)"');
    expect(csv).not.toContain('```');
    expect(csv).toContain('"1","1"');
  });
});

describe('class report', () => {
  it('lists questions hardest first so the weak spots lead', () => {
    const html = classReportHtml(REPORT);
    expect(html.indexOf('DNA replication')).toBeLessThan(
      html.indexOf('Which organelle'),
    );
    expect(html).toContain('25%');
    expect(html).toContain('75%');
  });

  it('reports class aggregates, never who answered what', () => {
    const html = classReportHtml(REPORT);
    // Standings (names + scores) are present…
    expect(html).toContain('Ben');
    expect(html).toContain('2100');
    // …but no per-player answer ever appears next to a question.
    expect(html).toContain('Conservative — 2');
    expect(html).toContain('No answer — 1');
    expect(html).not.toMatch(/Ava[^]{0,80}Conservative/);
  });

  it('stacks standings and question accuracy in one CSV', () => {
    const lines = classReportCsv(REPORT).trim().split('\r\n');
    expect(lines[0]).toBe('"Final standings"');
    expect(lines[1]).toBe('"rank","nickname","score","correct_answers"');
    expect(lines[2]).toBe('1,"Ben",2100,3');
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('"Question accuracy"');
    // Option columns are padded to the widest question in the quiz.
    expect(lines[6]).toContain(
      '"option_a_count","option_b_count","option_c_count","option_d_count"',
    );
    expect(lines[7]).toBe(
      '1,"Which organelle makes ATP?","Mitochondrion",3,1,0,75,1,3,0,0',
    );
    // A 2-option question still fills all four columns.
    expect(lines[8]).toBe(
      '2,"DNA replication is…","Semi-conservative",1,2,1,25,2,1,0,0',
    );
  });
});

describe('filenames', () => {
  it('builds a readable name from the quiz title and nickname', () => {
    expect(studySheetName(REVIEW, 'html')).toBe('Cell-Biology-Ava-results.html');
    expect(classReportName(REPORT, 'csv')).toBe('Cell-Biology-class-report.csv');
  });

  it('survives titles and nicknames with nothing filename-safe in them', () => {
    expect(slug('  ///  ', 'quiz')).toBe('quiz');
    expect(slug('Ünit 3: Cells & Tissues!')).toBe('nit-3-Cells-Tissues');
    expect(slug('a'.repeat(80)).length).toBeLessThanOrEqual(40);
  });
});
