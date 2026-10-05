import { describe, it, expect } from 'vitest';
import type {
  ChoiceType,
  HostReport,
  PersonalReview,
  QuestionStat,
  ReviewAnswer,
} from '@cadoot/shared';
import {
  classReportCsv,
  classReportHtml,
  classReportName,
  slug,
  studySheetCsv,
  studySheetHtml,
  studySheetName,
} from './results';

type ChoiceReview = Extract<ReviewAnswer, { type: ChoiceType }>;

/** Q1 of the review: answered, and right. */
const FIRST: ChoiceReview = {
  type: 'multiple',
  questionIndex: 0,
  text: 'Which organelle makes ATP?',
  options: ['Ribosome', 'Mitochondrion', 'Golgi body', 'Nucleus'],
  correctIndex: 1,
  answerIndex: 1,
  answered: true,
  correct: true,
  pointsEarned: 1000,
};

const REVIEW: PersonalReview = {
  quizTitle: 'Cell Biology',
  finishedAt: Date.UTC(2026, 7, 6, 15, 30),
  nickname: 'Ava',
  rank: 2,
  totalPlayers: 3,
  score: 1400,
  correctCount: 1,
  gradedCount: 3,
  answers: [
    FIRST,
    {
      type: 'multiple',
      questionIndex: 1,
      text: 'DNA replication is…',
      options: ['Conservative', 'Semi-conservative'],
      correctIndex: 1,
      answerIndex: 0,
      answered: true,
      correct: false,
      pointsEarned: 0,
    },
    {
      type: 'multiple',
      questionIndex: 2,
      text: 'Enzymes are made of…',
      options: ['Lipid', 'Protein'],
      correctIndex: 1,
      answerIndex: null,
      answered: false,
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
      type: 'multiple',
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
      type: 'multiple',
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
        { ...FIRST, text: 'Is 1 < 2 & 3 > 2?', options: ['<b>yes</b>', 'no'] },
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
          ...FIRST,
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
          ...FIRST,
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
      answers: [{ ...FIRST, text: 'What does\nthis print?' }],
    });
    expect(csv).toContain('"What does this print?"');
    expect(csv.trim().split('\r\n')).toHaveLength(2);
  });

  it('strips code fences from spreadsheet cells, keeping the code itself', () => {
    const csv = studySheetCsv({
      ...REVIEW,
      answers: [
        {
          ...FIRST,
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

describe('questions with more than four options', () => {
  const EIGHT = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('letters every option on the study sheet', () => {
    const html = studySheetHtml({
      ...REVIEW,
      answers: [{ ...FIRST, options: EIGHT, correctIndex: 7, answerIndex: 6, correct: false }],
    });
    expect(html).toMatch(/<span class="letter">G<\/span>\s*<span class="text">g<\/span>/);
    expect(html).toMatch(/<span class="letter">H<\/span>\s*<span class="text">h<\/span>/);
  });

  it('widens the class-report CSV to the most options in the quiz', () => {
    const lines = classReportCsv({
      ...REPORT,
      questions: [
        ...REPORT.questions,
        {
          type: 'multiple',
          questionIndex: 2,
          text: 'Eight-way',
          options: EIGHT,
          correctIndex: 7,
          distribution: [0, 0, 0, 0, 0, 1, 0, 3],
          correctCount: 3,
          noAnswerCount: 0,
          accuracy: 0.75,
        },
      ],
    })
      .trim()
      .split('\r\n');
    expect(lines[6]).toContain('"option_e_count","option_f_count","option_g_count","option_h_count"');
    // Four-option questions pad the extra columns with zeroes.
    expect(lines[7]).toBe('1,"Which organelle makes ATP?","Mitochondrion",3,1,0,75,1,3,0,0,0,0,0,0');
    expect(lines[9]).toBe('3,"Eight-way","h",3,1,0,75,0,0,0,0,0,1,0,3');
  });
});

describe('fill-in-the-blank, open-ended and puzzle questions', () => {
  const PAIRS = [
    { left: 'HTTP', right: '80' },
    { left: 'HTTPS', right: '443' },
    { left: 'SSH', right: '22' },
  ];
  const MIXED: PersonalReview = {
    ...REVIEW,
    correctCount: 0,
    gradedCount: 2,
    answers: [
      {
        type: 'fill',
        questionIndex: 0,
        text: 'Capital of France: ___',
        answers: ['Paris', 'Paris, France'],
        answerText: '<b>Lyon</b>',
        answered: true,
        correct: false,
        pointsEarned: 0,
      },
      {
        type: 'open',
        questionIndex: 1,
        text: 'One word for today?',
        answerText: 'Fun',
        answered: true,
        correct: false,
        pointsEarned: 0,
      },
      {
        type: 'puzzle',
        questionIndex: 2,
        text: 'Match the ports',
        pairs: PAIRS,
        answerOrder: [0, 2, 1],
        answered: true,
        correct: false,
        pointsEarned: 400,
      },
    ],
  };

  it('shows each type’s answer key next to what the student gave', () => {
    const html = studySheetHtml(MIXED);
    // Fill: their (escaped) answer, then everything that would have counted.
    expect(html).toContain('&lt;b&gt;Lyon&lt;/b&gt;');
    expect(html).not.toContain('<b>Lyon</b>');
    expect(html).toContain('Paris / Paris, France');
    expect(html).toContain('accepted answers');
    // Open: their answer, marked as unscored rather than wrong.
    expect(html).toContain('✎ Open-ended');
    expect(html).toContain('not scored');
    // Puzzle: partial credit, and the right match for each miss.
    expect(html).toContain('✗ 1 of 3 matched');
    expect(html).toContain('HTTPS → 22');
    expect(html).toContain('should be 443');
    // Only graded questions count toward the score line.
    expect(html).toContain('0 of 2');
  });

  it('spells the new types out in the study-sheet CSV', () => {
    const lines = studySheetCsv(MIXED).trim().split('\r\n');
    expect(lines[1]).toBe('1,"Capital of France: ___","<b>Lyon</b>","Paris / Paris, France","wrong",0');
    expect(lines[2]).toBe('2,"One word for today?","Fun","","not scored",0');
    expect(lines[3]).toBe(
      '3,"Match the ports","HTTP → 80; HTTPS → 22; SSH → 443","HTTP → 80; HTTPS → 443; SSH → 22","partly correct (1/3)",400',
    );
  });

  const STATS: QuestionStat[] = [
    {
      type: 'fill',
      questionIndex: 0,
      text: 'Capital of France: ___',
      answers: ['Paris'],
      responses: [
        { text: 'Paris', count: 2, correct: true },
        { text: 'Lyon', count: 1, correct: false },
      ],
      correctCount: 2,
      noAnswerCount: 1,
      accuracy: 0.5,
    },
    {
      type: 'open',
      questionIndex: 1,
      text: 'One word for today?',
      responses: [{ text: 'Fun', count: 3 }],
      correctCount: 0,
      noAnswerCount: 1,
      accuracy: 0,
    },
    {
      type: 'puzzle',
      questionIndex: 2,
      text: 'Match the ports',
      pairs: PAIRS,
      pairCorrect: [4, 2, 2],
      correctCount: 2,
      noAnswerCount: 0,
      accuracy: 0.5,
    },
  ];
  const MIXED_REPORT: HostReport = { ...REPORT, questions: [...REPORT.questions, ...STATS] };

  it('keeps open-ended questions out of the accuracy table', () => {
    const html = classReportHtml(MIXED_REPORT);
    const accuracy = html.slice(html.indexOf('Question accuracy'), html.indexOf('Open-ended responses'));
    expect(accuracy).toContain('Accepted: Paris');
    expect(accuracy).toContain('“Lyon” — 1');
    expect(accuracy).toContain('HTTP → 80 — 4 matched');
    expect(accuracy).not.toContain('One word for today?');
    const open = html.slice(html.indexOf('Open-ended responses'), html.indexOf('Final standings'));
    expect(open).toContain('One word for today?');
    expect(open).toContain('Fun — 3');
    expect(open).toContain('3/4');
  });

  it('adds the new types to the class-report CSV', () => {
    const lines = classReportCsv(MIXED_REPORT).trim().split('\r\n');
    // Fill and puzzle rows leave the per-option counts blank.
    expect(lines).toContain('1,"Capital of France: ___","Paris",2,1,1,50,"","","",""');
    expect(lines).toContain(
      '3,"Match the ports","HTTP → 80; HTTPS → 443; SSH → 22",2,2,0,50,"","","",""',
    );
    // Open-ended answers get their own table at the end.
    const open = lines.indexOf('"Open-ended responses"');
    expect(open).toBeGreaterThan(0);
    expect(lines[open + 1]).toBe('"question_number","question","response","count"');
    expect(lines[open + 2]).toBe('2,"One word for today?","Fun",3');
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
