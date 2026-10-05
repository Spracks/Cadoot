import { describe, it, expect } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Quiz,
} from '@cadoot/shared';
import { registerHandlers } from './handlers';

function once<T = any>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as never));
}

async function setup() {
  const httpServer: HttpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  registerHandlers(io);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  const teardown = () => {
    io.close();
    httpServer.close();
  };
  return { url, teardown };
}

function connect(url: string): ClientSocket {
  return ioc(url, { transports: ['websocket'], forceNew: true });
}

const QUIZ: Quiz = {
  title: 'Integration',
  questions: [
    { text: 'Q1', type: 'multiple', options: ['a', 'b', 'c', 'd'], correctIndex: 0, timeLimitSec: 30 },
    { text: 'Q2', type: 'multiple', options: ['x', 'y'], correctIndex: 1, timeLimitSec: 30 },
  ],
};

describe('game flow (end-to-end over sockets)', () => {
  it('creates a game, joins players, scores, and ends', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);

    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      expect(created.pin).toMatch(/^\d{6}$/);
      const pin = created.pin as string;

      const aliceJoin = await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      const bobJoin = await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });
      expect(aliceJoin.ok).toBe(true);
      expect(bobJoin.ok).toBe(true);

      // Host sees both players in the lobby.
      const lobbyPromise = once<{ players: unknown[] }>(host, 'lobby:update');
      // (lobby:update already fired on join; grab the current one via a no-op join attempt is unnecessary)

      // --- Question 1 ---
      const shownPromise = once<Record<string, unknown>>(alice, 'question:show');
      host.emit('host:startGame');
      const shown = await shownPromise;
      // SECURITY: the public question must never leak the correct answer.
      expect(shown).not.toHaveProperty('correctIndex');
      expect((shown.options as string[]).length).toBe(4);

      const revealPromise = once<any>(host, 'question:results');
      const aliceResultPromise = once<any>(alice, 'answer:result');
      alice.emit('player:answer', { optionIndex: 0 }); // correct
      bob.emit('player:answer', { optionIndex: 1 }); // wrong
      const reveal = await revealPromise;
      const aliceResult = await aliceResultPromise;

      expect(reveal.correctIndex).toBe(0);
      expect(reveal.distribution).toEqual([1, 1, 0, 0]);
      expect(reveal.leaderboard[0].nickname).toBe('Alice');
      expect(aliceResult.correct).toBe(true);
      expect(aliceResult.pointsEarned).toBeGreaterThan(0);

      // --- Question 2 ---
      const shown2Promise = once<Record<string, unknown>>(bob, 'question:show');
      host.emit('host:nextQuestion');
      await shown2Promise;

      const reveal2Promise = once<any>(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 0 }); // wrong
      bob.emit('player:answer', { optionIndex: 1 }); // correct
      const reveal2 = await reveal2Promise;
      expect(reveal2.correctIndex).toBe(1);

      // --- End ---
      const overPromise = once<any>(host, 'game:over');
      host.emit('host:nextQuestion'); // past the last question -> game over
      const over = await overPromise;
      expect(over.leaderboard).toHaveLength(2);
      const total = over.leaderboard.reduce((s: number, e: any) => s + e.score, 0);
      expect(total).toBeGreaterThan(0);

      void lobbyPromise;
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('rejects a duplicate nickname and a bad PIN', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const a = connect(url);
    const b = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;

      const first = await a.emitWithAck('player:join', { pin, nickname: 'Sam' });
      expect(first.ok).toBe(true);

      const dup = await b.emitWithAck('player:join', { pin, nickname: 'sam' });
      expect(dup.ok).toBe(false);

      const badPin = await b.emitWithAck('player:join', { pin: '000000', nickname: 'Sam' });
      expect(badPin.ok).toBe(false);
    } finally {
      host.close();
      a.close();
      b.close();
      teardown();
    }
  }, 15000);

  it('lets a dropped player rejoin and keep their score', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;
      const aJoin = await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });
      const aliceId = aJoin.playerId as string;

      // Q1: Alice correct, Bob wrong -> reveal.
      const shown = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown;
      const revealP = once<any>(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 0 });
      bob.emit('player:answer', { optionIndex: 1 });
      const reveal = await revealP;
      const aliceScore = reveal.leaderboard.find(
        (e: any) => e.nickname === 'Alice',
      ).score;
      expect(aliceScore).toBeGreaterThan(0);

      // Alice's phone drops.
      alice.close();

      // A fresh socket rejoins with her playerId and is resynced.
      const alice2 = connect(url);
      const syncP = once<any>(alice2, 'state:sync');
      const rejoin = await alice2.emitWithAck('player:rejoin', {
        pin,
        playerId: aliceId,
      });
      expect(rejoin.ok).toBe(true);
      expect(rejoin.nickname).toBe('Alice');
      const snap = await syncP;
      expect(snap.phase).toBe('reveal');
      expect(snap.myResult.totalScore).toBe(aliceScore);

      // Q2 then end — no duplicate Alice, score carried forward.
      const shown2 = once(bob, 'question:show');
      host.emit('host:nextQuestion');
      await shown2;
      const reveal2P = once<any>(host, 'question:results');
      alice2.emit('player:answer', { optionIndex: 1 }); // correct on Q2
      bob.emit('player:answer', { optionIndex: 0 });
      await reveal2P;

      const overP = once<any>(host, 'game:over');
      host.emit('host:nextQuestion');
      const over = await overP;
      const aliceRows = over.leaderboard.filter((e: any) => e.nickname === 'Alice');
      expect(aliceRows).toHaveLength(1);
      expect(aliceRows[0].score).toBeGreaterThan(aliceScore);

      alice2.close();
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('survives a host reload and lets the host reclaim control', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;
      const hostToken = created.hostToken as string;
      expect(hostToken).toBeTruthy();

      await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });

      const shown = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown;
      const revealP = once<any>(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 0 }); // correct
      bob.emit('player:answer', { optionIndex: 1 }); // wrong
      await revealP;

      // The host's laptop "reloads": the socket drops. The game must NOT end.
      host.close();

      // A fresh host socket reclaims the game with the stored token.
      const host2 = connect(url);
      const syncP = once<any>(host2, 'host:sync');
      const rejoin = await host2.emitWithAck('host:rejoin', { pin, hostToken });
      expect(rejoin.ok).toBe(true);
      const sync = await syncP;
      expect(sync.phase).toBe('reveal');
      expect(sync.reveal.leaderboard[0].nickname).toBe('Alice');

      // Control is restored: the reclaimed host can advance the game.
      const shown2 = once(bob, 'question:show');
      host2.emit('host:nextQuestion');
      await shown2;
      host2.close();
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('sends each player their own answers and the host a class report', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;
      await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });

      // Q1: Alice correct, Bob wrong.
      const shown1 = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown1;
      const reveal1 = once(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 0 });
      bob.emit('player:answer', { optionIndex: 1 });
      await reveal1;

      // Q2: Alice correct, Bob never answers — the host reveals early.
      const shown2 = once(alice, 'question:show');
      host.emit('host:nextQuestion');
      await shown2;
      const reveal2 = once(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 1 });
      host.emit('host:skipQuestion');
      await reveal2;

      const aliceReviewP = once<any>(alice, 'results:review');
      const bobReviewP = once<any>(bob, 'results:review');
      const reportP = once<any>(host, 'results:report');
      host.emit('host:nextQuestion'); // past the last question -> game over

      const [aliceReview, bobReview, report] = await Promise.all([
        aliceReviewP,
        bobReviewP,
        reportP,
      ]);

      // Each player gets their OWN answers, with the correct one now included.
      expect(aliceReview.nickname).toBe('Alice');
      expect(aliceReview.correctCount).toBe(2);
      expect(aliceReview.answers).toHaveLength(2);
      expect(aliceReview.answers[0]).toMatchObject({
        questionIndex: 0,
        text: 'Q1',
        correctIndex: 0,
        answerIndex: 0,
        correct: true,
      });
      // PRIVACY: a player's review never carries anyone else's results.
      expect(JSON.stringify(aliceReview)).not.toContain('Bob');

      // A skipped question still counts, and a non-answer is recorded as such.
      expect(bobReview.correctCount).toBe(0);
      expect(bobReview.answers[0]).toMatchObject({ answerIndex: 1, correct: false });
      expect(bobReview.answers[1]).toMatchObject({ answerIndex: null, correct: false });

      // The host report is aggregate: per-question accuracy, plus standings.
      expect(report.playerCount).toBe(2);
      expect(report.questions).toHaveLength(2);
      expect(report.questions[0]).toMatchObject({
        correctCount: 1,
        noAnswerCount: 0,
        accuracy: 0.5,
        distribution: [1, 1, 0, 0],
      });
      expect(report.questions[1]).toMatchObject({
        correctCount: 1,
        noAnswerCount: 1,
        distribution: [0, 1],
      });
      expect(report.standings[0]).toMatchObject({
        rank: 1,
        nickname: 'Alice',
        correctCount: 2,
      });
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('still hands a reloading player their results after the game ends', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;
      const aJoin = await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      const aliceId = aJoin.playerId as string;

      const shown = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown;
      const revealP = once(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 0 });
      await revealP;

      const overP = once(host, 'game:over');
      host.emit('host:endGame'); // ends mid-quiz, after one scored question
      await overP;

      // Alice's phone reloads on the results screen.
      alice.close();
      const alice2 = connect(url);
      const syncP = once<any>(alice2, 'state:sync');
      await alice2.emitWithAck('player:rejoin', { pin, playerId: aliceId });
      const snap = await syncP;

      expect(snap.phase).toBe('over');
      // Only the question that was actually scored appears — Q2 never ran.
      expect(snap.review.answers).toHaveLength(1);
      expect(snap.review.answers[0].correct).toBe(true);
      alice2.close();
    } finally {
      host.close();
      alice.close();
      teardown();
    }
  }, 15000);

  it('tracks answer streaks and reports rank movement', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;
      await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });

      // Q1: Alice correct -> streak 1, no bonus yet, no prior rank (delta null).
      const shown1 = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown1;
      const a1P = once<any>(alice, 'answer:result');
      alice.emit('player:answer', { optionIndex: 0 }); // correct
      bob.emit('player:answer', { optionIndex: 1 }); // wrong
      const a1 = await a1P;
      expect(a1.streak).toBe(1);
      expect(a1.streakBonus).toBe(0);
      expect(a1.rankDelta).toBeNull();

      // Q2: Alice correct again -> streak 2 earns a bonus.
      const shown2 = once(alice, 'question:show');
      host.emit('host:nextQuestion');
      await shown2;
      const a2P = once<any>(alice, 'answer:result');
      alice.emit('player:answer', { optionIndex: 1 }); // Q2 correct index is 1
      bob.emit('player:answer', { optionIndex: 0 }); // wrong
      const a2 = await a2P;
      expect(a2.streak).toBe(2);
      expect(a2.streakBonus).toBeGreaterThan(0);
      // Rank delta is present (a number) now that there is a prior standing.
      expect(typeof a2.rankDelta).toBe('number');
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('breaks a streak when time runs out, except on open-ended questions', async () => {
    const quiz: Quiz = {
      title: 'Timeouts',
      questions: [
        { type: 'multiple', text: 'Q1', options: ['a', 'b'], correctIndex: 0, timeLimitSec: 30 },
        { type: 'open', text: 'Q2', timeLimitSec: 30 },
        { type: 'multiple', text: 'Q3', options: ['a', 'b'], correctIndex: 0, timeLimitSec: 30 },
      ],
    };
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz });
      const pin = created.pin as string;
      await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });

      const shown1 = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown1;
      const r1P = once<any>(alice, 'answer:result');
      alice.emit('player:answer', { optionIndex: 0 });
      expect((await r1P).streak).toBe(1);

      // Skipping an open-ended question she never answered leaves it intact...
      const shown2 = once(alice, 'question:show');
      host.emit('host:nextQuestion');
      await shown2;
      const r2P = once<any>(alice, 'answer:result');
      host.emit('host:skipQuestion');
      expect((await r2P).streak).toBe(1);

      // ...but letting a graded question run out breaks it.
      const shown3 = once(alice, 'question:show');
      host.emit('host:nextQuestion');
      await shown3;
      const r3P = once<any>(alice, 'answer:result');
      host.emit('host:skipQuestion');
      expect(await r3P).toMatchObject({ streak: 0, streakBonus: 0, correct: false });
    } finally {
      host.close();
      alice.close();
      teardown();
    }
  }, 15000);

  it('plays fill-in-the-blank, open-ended and puzzle questions', async () => {
    const PAIRS = [
      { left: 'HTTP', right: '80' },
      { left: 'HTTPS', right: '443' },
      { left: 'SSH', right: '22' },
    ];
    const MIXED: Quiz = {
      title: 'Mixed',
      questions: [
        { type: 'multiple', text: 'Warm-up', options: ['a', 'b'], correctIndex: 0, timeLimitSec: 30 },
        { type: 'fill', text: 'Capital of France: ___', answers: ['Paris'], timeLimitSec: 30 },
        { type: 'open', text: 'One word for today?', timeLimitSec: 30 },
        { type: 'puzzle', text: 'Match the ports', pairs: PAIRS, timeLimitSec: 30 },
      ],
    };
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: MIXED });
      const pin = created.pin as string;
      await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });

      /** Show the next question, have both players answer, return the reveal. */
      async function play(
        start: 'host:startGame' | 'host:nextQuestion',
        answers: (shown: any) => [unknown, unknown],
      ) {
        const shownP = once<any>(alice, 'question:show');
        host.emit(start);
        const shown = await shownP;
        const [a, b] = answers(shown);
        const revealP = once<any>(host, 'question:results');
        const aliceP = once<any>(alice, 'answer:result');
        const bobP = once<any>(bob, 'answer:result');
        alice.emit('player:answer', a as never);
        bob.emit('player:answer', b as never);
        return { shown, reveal: await revealP, alice: await aliceP, bob: await bobP };
      }

      // Q1 (choice): both right, so both carry a streak of 1 into the rest.
      await play('host:startGame', () => [{ optionIndex: 0 }, { optionIndex: 0 }]);

      // Q2 (fill): matching is forgiving; the answer key stays off the question.
      const fill = await play('host:nextQuestion', () => [{ text: ' paris. ' }, { text: 'Lyon' }]);
      expect(fill.shown).not.toHaveProperty('answers');
      expect(fill.shown.options).toEqual([]);
      expect(fill.alice).toMatchObject({ correct: true, streak: 2 });
      expect(fill.bob).toMatchObject({ correct: false, pointsEarned: 0, streak: 0 });
      expect(fill.reveal).toMatchObject({ type: 'fill', answers: ['Paris'], correctCount: 1 });
      expect(fill.reveal.responses).toHaveLength(2);

      // Q3 (open): unscored, and it neither extends nor breaks a streak.
      const open = await play('host:nextQuestion', () => [{ text: 'Fun' }, { text: 'fun!' }]);
      expect(open.alice).toMatchObject({ correct: false, pointsEarned: 0, streak: 2 });
      expect(open.reveal).toMatchObject({
        type: 'open',
        correctCount: 0,
        responses: [{ text: 'Fun', count: 2 }],
      });
      // The score ceiling only counts graded questions, so Q3 adds nothing.
      expect(open.reveal.maxPossible).toBe(fill.reveal.maxPossible);

      // Q4 (puzzle): Alice matches everything, Bob gets one pair of three.
      const puzzle = await play('host:nextQuestion', (shown) => {
        const slotOf = (right: string) => (shown.options as string[]).indexOf(right);
        const perfect = PAIRS.map((p) => slotOf(p.right));
        // Swap the last two placements: only the first pair stays right.
        const partial = [perfect[0], perfect[2], perfect[1]];
        return [{ order: perfect }, { order: partial }];
      });
      // The shown matches are shuffled so none sits beside its partner.
      expect(puzzle.shown).not.toHaveProperty('pairs');
      expect(puzzle.shown.prompts).toEqual(['HTTP', 'HTTPS', 'SSH']);
      (puzzle.shown.options as string[]).forEach((right, slot) =>
        expect(right).not.toBe(PAIRS[slot]!.right),
      );
      expect(puzzle.alice).toMatchObject({ correct: true, matched: { count: 3, total: 3 } });
      expect(puzzle.bob).toMatchObject({ correct: false, matched: { count: 1, total: 3 } });
      expect(puzzle.bob.pointsEarned).toBeGreaterThan(0);
      expect(puzzle.bob.pointsEarned).toBeLessThan(puzzle.alice.pointsEarned);
      expect(puzzle.reveal).toMatchObject({ type: 'puzzle', correctCount: 1, pairCorrect: [2, 1, 1] });

      // Post-game: the review and report carry each type's key and answers.
      const reviewP = once<any>(bob, 'results:review');
      const reportP = once<any>(host, 'results:report');
      host.emit('host:nextQuestion');
      const review = await reviewP;
      const report = await reportP;
      expect(review.gradedCount).toBe(3);
      expect(review.answers[1]).toMatchObject({ type: 'fill', answerText: 'Lyon', correct: false });
      expect(review.answers[2]).toMatchObject({ type: 'open', answerText: 'fun!' });
      expect(review.answers[3]).toMatchObject({ type: 'puzzle', answerOrder: [0, 2, 1] });
      expect(report.questions.map((q: any) => q.type)).toEqual(['multiple', 'fill', 'open', 'puzzle']);
      expect(report.questions[3]).toMatchObject({ correctCount: 1, accuracy: 0.5 });
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('ignores answers that do not fit the question', async () => {
    const quiz: Quiz = {
      title: 'Strict',
      questions: [
        {
          type: 'puzzle',
          text: 'Match',
          pairs: [
            { left: 'a', right: '1' },
            { left: 'b', right: '2' },
          ],
          timeLimitSec: 30,
        },
      ],
    };
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz });
      const pin = created.pin as string;
      await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      const shownP = once(alice, 'question:show');
      const startProgressP = once(host, 'question:answered');
      host.emit('host:startGame');
      await shownP;
      await startProgressP;

      // None of these fit a puzzle, so none counts as Alice's answer...
      const progress: unknown[] = [];
      host.on('question:answered', (p) => progress.push(p));
      alice.emit('player:answer', { optionIndex: 0 });
      alice.emit('player:answer', { text: 'a=1' });
      alice.emit('player:answer', { order: [0, 0] });
      // ...and the first well-formed order is the one that locks in.
      const resultP = once<any>(alice, 'answer:result');
      alice.emit('player:answer', { order: [1, 0] });
      const result = await resultP;
      expect(progress).toEqual([{ answered: 1, total: 1 }]);
      expect(result.matched).toEqual({ count: 2, total: 2 });
    } finally {
      host.close();
      alice.close();
      teardown();
    }
  }, 15000);
});
