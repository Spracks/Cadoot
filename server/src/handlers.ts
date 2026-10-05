import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  QuizSchema,
  computeScore,
  streakBonus,
  maxPossibleScore,
  acceptAnswer,
  gradeAnswer,
  buildOutcome,
  isGraded,
  puzzleShuffle,
  DEFAULT_SCORE_CONFIG,
  type AnswerPayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type PlayerSummary,
  type LeaderboardEntry,
  type PublicQuestion,
  type PersonalResult,
  type Question,
  type RevealData,
  type ReviewDetail,
  type StateSync,
  type HostStateSync,
  type PersonalReview,
  type HostReport,
  type QuestionStat,
} from '@cadoot/shared';
import { GameManager, type Game, type Player } from './game';

const TICK_MS = 250;
/** How long a game survives a host disconnect before it's ended, in ms. */
const HOST_GRACE_MS = 120_000;

type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerHandlers(io: IoServer): GameManager {
  const manager = new GameManager();

  function lobbyPlayers(game: Game): PlayerSummary[] {
    return [...game.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      connected: p.connected,
      avatar: p.avatar || undefined,
    }));
  }

  /** How many connected players have locked in an answer this question. */
  function answerProgress(game: Game): { answered: number; total: number } {
    const connected = [...game.players.values()].filter((p) => p.connected);
    return {
      answered: connected.filter((p) => p.answered).length,
      total: connected.length,
    };
  }

  /** The current question minus its answer key. */
  function publicQuestion(game: Game, index: number): PublicQuestion {
    const q = game.quiz.questions[index]!;
    const base = {
      index,
      total: game.quiz.questions.length,
      text: q.text,
      type: q.type,
      timeLimitSec: q.timeLimitSec,
    };
    switch (q.type) {
      case 'multiple':
      case 'boolean':
        return { ...base, options: q.options };
      case 'fill':
      case 'open':
        return { ...base, options: [] };
      case 'puzzle': {
        // Sending the right-hand items in authored order would hand over the
        // answer, so they always go out in the shuffled order.
        const shuffle = game.shuffle ?? q.pairs.map((_, i) => i);
        return {
          ...base,
          prompts: q.pairs.map((p) => p.left),
          options: shuffle.map((i) => q.pairs[i]!.right),
        };
      }
    }
  }

  function remainingMs(game: Game): number {
    const q = game.quiz.questions[game.currentIndex];
    if (!q || game.questionStartedAt == null) return 0;
    return Math.max(0, q.timeLimitSec * 1000 - (Date.now() - game.questionStartedAt));
  }

  /** What the shared screen shows when the current question is revealed. */
  function revealData(game: Game, question: Question): RevealData {
    const players = [...game.players.values()];
    return {
      ...buildOutcome(
        question,
        players.map((p) => p.answer),
      ),
      correctCount: players.filter((p) => p.lastCorrect).length,
      leaderboard: leaderboard(game),
      maxPossible: maxPossible(game),
    };
  }

  function personalResult(game: Game, player: Player, rank: number): PersonalResult {
    const q = game.quiz.questions[game.currentIndex];
    return {
      correct: player.lastCorrect,
      pointsEarned: player.lastPoints,
      totalScore: player.score,
      rank,
      rankDelta: player.lastRankDelta,
      streak: player.streak,
      streakBonus: player.lastStreakBonus,
      ...(q?.type === 'puzzle'
        ? { matched: { count: player.lastMatched, total: q.pairs.length } }
        : {}),
    };
  }

  /** Build a full state snapshot for one (re)connecting player. */
  function buildSync(game: Game, player: Player): StateSync {
    const q = game.quiz.questions[game.currentIndex];
    if (game.phase === 'question' && q) {
      return {
        phase: 'question',
        question: publicQuestion(game, game.currentIndex),
        remainingMs: remainingMs(game),
        answered: player.answered,
        reveal: null,
        myResult: null,
        finalLeaderboard: null,
        review: null,
      };
    }
    if (game.phase === 'reveal' && q) {
      const ranked = sortedPlayers(game);
      const rank = ranked.findIndex((p) => p.id === player.id) + 1;
      return {
        phase: 'reveal',
        question: publicQuestion(game, game.currentIndex),
        remainingMs: 0,
        answered: player.answered,
        reveal: revealData(game, q),
        myResult: personalResult(game, player, rank),
        finalLeaderboard: null,
        review: null,
      };
    }
    if (game.phase === 'over') {
      return {
        phase: 'over',
        question: null,
        remainingMs: 0,
        answered: false,
        reveal: null,
        myResult: null,
        finalLeaderboard: leaderboard(game),
        // A student who reloads after the game can still get their study sheet.
        review: buildReview(game, player),
      };
    }
    return {
      phase: 'lobby',
      question: null,
      remainingMs: 0,
      answered: false,
      reveal: null,
      myResult: null,
      finalLeaderboard: null,
      review: null,
    };
  }

  function sortedPlayers(game: Game): Player[] {
    return [...game.players.values()].sort((a, b) => b.score - a.score);
  }

  /**
   * Score ceiling across every question scored so far. Computed here rather
   * than on the client so it stays correct if scoring rules ever change.
   */
  function maxPossible(game: Game): number {
    const asked = game.quiz.questions.slice(0, game.currentIndex + 1);
    return maxPossibleScore(asked.filter(isGraded).length);
  }

  function leaderboard(game: Game): LeaderboardEntry[] {
    return sortedPlayers(game).map((p, i) => ({
      nickname: p.nickname,
      score: p.score,
      rank: i + 1,
      avatar: p.avatar || undefined,
      delta: p.lastRankDelta,
      // Scores are committed in reveal() before this runs, so `score` is the
      // new total and `lastPoints` is what the question just added.
      gained: p.lastPoints,
    }));
  }

  /**
   * One player's post-game review, for their downloadable study sheet. Built
   * from their recorded history, so a game ended early only reports the
   * questions that actually counted.
   */
  function buildReview(game: Game, player: Player): PersonalReview {
    const ranked = sortedPlayers(game);
    return {
      quizTitle: game.quiz.title,
      finishedAt: game.finishedAt ?? Date.now(),
      nickname: player.nickname,
      rank: ranked.findIndex((p) => p.id === player.id) + 1,
      totalPlayers: game.players.size,
      score: player.score,
      correctCount: player.history.filter((h) => h.correct).length,
      gradedCount: player.history.filter((h) =>
        isGraded(game.quiz.questions[h.questionIndex]!),
      ).length,
      answers: player.history.map((h) => {
        const q = game.quiz.questions[h.questionIndex]!;
        return {
          ...reviewDetail(q, h.answer),
          questionIndex: h.questionIndex,
          text: q.text,
          answered: h.answer !== null,
          correct: h.correct,
          pointsEarned: h.points,
        };
      }),
    };
  }

  /** One question's answer key next to what one player answered. */
  function reviewDetail(
    q: Question,
    answer: AnswerPayload | null,
  ): ReviewDetail {
    switch (q.type) {
      case 'multiple':
      case 'boolean':
        return {
          type: q.type,
          options: q.options,
          correctIndex: q.correctIndex,
          answerIndex: answer && 'optionIndex' in answer ? answer.optionIndex : null,
        };
      case 'fill':
        return {
          type: 'fill',
          answers: q.answers,
          answerText: answer && 'text' in answer ? answer.text : null,
        };
      case 'open':
        return { type: 'open', answerText: answer && 'text' in answer ? answer.text : null };
      case 'puzzle':
        return {
          type: 'puzzle',
          pairs: q.pairs,
          answerOrder: answer && 'order' in answer ? answer.order : null,
        };
    }
  }

  /**
   * The host's class report: final standings plus how the class did on each
   * question. Aggregate by design — it never breaks out who answered what.
   */
  function buildReport(game: Game): HostReport {
    const players = [...game.players.values()];
    const questions: QuestionStat[] = [];
    for (let i = 0; i < game.questionsScored; i++) {
      const q = game.quiz.questions[i];
      if (!q) continue;
      // History is appended once per scored question, in order, for every
      // player — nobody can join mid-game — so index i is question i.
      const records = players.map((p) => p.history[i]);
      const correctCount = records.filter((rec) => rec?.correct).length;
      questions.push({
        ...buildOutcome(
          q,
          records.map((rec) => rec?.answer ?? null),
        ),
        questionIndex: i,
        text: q.text,
        correctCount,
        noAnswerCount: records.filter((rec) => !rec?.answer).length,
        accuracy: players.length > 0 ? correctCount / players.length : 0,
      });
    }
    return {
      quizTitle: game.quiz.title,
      finishedAt: game.finishedAt ?? Date.now(),
      playerCount: players.length,
      standings: sortedPlayers(game).map((p, i) => ({
        rank: i + 1,
        nickname: p.nickname,
        score: p.score,
        correctCount: p.history.filter((h) => h.correct).length,
      })),
      questions,
    };
  }

  /** Full snapshot for a reconnecting host, mirroring the live game state. */
  function buildHostSync(game: Game): HostStateSync {
    const q = game.quiz.questions[game.currentIndex];
    const base = {
      pin: game.pin,
      quizTitle: game.quiz.title,
      players: lobbyPlayers(game),
      answeredCount: answerProgress(game).answered,
    };
    if (game.phase === 'question' && q) {
      return {
        ...base,
        phase: 'question',
        question: publicQuestion(game, game.currentIndex),
        remainingMs: remainingMs(game),
        reveal: null,
        finalLeaderboard: null,
        report: null,
      };
    }
    if (game.phase === 'reveal' && q) {
      return {
        ...base,
        phase: 'reveal',
        question: publicQuestion(game, game.currentIndex),
        remainingMs: 0,
        reveal: revealData(game, q),
        finalLeaderboard: null,
        report: null,
      };
    }
    if (game.phase === 'over') {
      return {
        ...base,
        phase: 'over',
        question: null,
        remainingMs: 0,
        reveal: null,
        finalLeaderboard: leaderboard(game),
        report: buildReport(game),
      };
    }
    return {
      ...base,
      phase: 'lobby',
      question: null,
      remainingMs: 0,
      reveal: null,
      finalLeaderboard: null,
      report: null,
    };
  }

  function clearTimers(game: Game): void {
    if (game.questionTimer) {
      clearTimeout(game.questionTimer);
      game.questionTimer = null;
    }
    if (game.tickTimer) {
      clearInterval(game.tickTimer);
      game.tickTimer = null;
    }
  }

  function startQuestion(game: Game, index: number): void {
    clearTimers(game);
    const question = game.quiz.questions[index];
    if (!question) return;

    game.currentIndex = index;
    game.phase = 'question';
    game.questionStartedAt = Date.now();
    game.shuffle = question.type === 'puzzle' ? puzzleShuffle(question.pairs.length) : null;
    for (const p of game.players.values()) {
      p.answered = false;
      p.answer = null;
      p.lastCorrect = false;
      p.lastPoints = 0;
      p.lastMatched = 0;
    }

    io.to(game.pin).emit('question:show', publicQuestion(game, index));
    io.to(game.pin).emit('question:answered', answerProgress(game));

    const durationMs = question.timeLimitSec * 1000;
    game.questionTimer = setTimeout(() => endQuestion(game), durationMs);
    game.tickTimer = setInterval(() => {
      const started = game.questionStartedAt ?? Date.now();
      const remaining = Math.max(0, durationMs - (Date.now() - started));
      io.to(game.pin).emit('question:tick', { remainingMs: remaining });
      if (remaining <= 0 && game.tickTimer) {
        clearInterval(game.tickTimer);
        game.tickTimer = null;
      }
    }, TICK_MS);
  }

  function endQuestion(game: Game): void {
    if (game.phase !== 'question') return;
    clearTimers(game);
    game.phase = 'reveal';

    const question = game.quiz.questions[game.currentIndex];
    if (!question) return;

    for (const p of game.players.values()) {
      p.score += p.lastPoints;
      // Commit this question to the permanent record before the next one
      // overwrites the `last*` fields. Non-answerers are recorded too.
      p.history.push({
        questionIndex: game.currentIndex,
        answer: p.answered ? p.answer : null,
        correct: p.lastCorrect,
        points: p.lastPoints,
      });
    }
    game.questionsScored = game.currentIndex + 1;

    // Recompute standings, then record each player's rank movement vs the
    // previous reveal before overwriting their stored rank.
    const ranked = sortedPlayers(game);
    ranked.forEach((p, i) => {
      const newRank = i + 1;
      p.lastRankDelta = p.rank == null ? null : p.rank - newRank;
      p.rank = newRank;
    });

    io.to(game.pin).emit('question:results', revealData(game, question));

    for (const p of game.players.values()) {
      io.to(p.socketId).emit('answer:result', personalResult(game, p, p.rank ?? 0));
    }
  }

  function gameOver(game: Game): void {
    clearTimers(game);
    game.phase = 'over';
    game.finishedAt = Date.now();
    io.to(game.pin).emit('game:over', { leaderboard: leaderboard(game) });

    // Post-game downloads. Both are point-to-point rather than broadcast: a
    // student gets only their own answers, and the class report stays on the
    // host's machine.
    io.to(game.hostSocketId).emit('results:report', buildReport(game));
    for (const p of game.players.values()) {
      io.to(p.socketId).emit('results:review', buildReview(game, p));
    }
  }

  io.on('connection', (socket: IoSocket) => {
    socket.on('host:createGame', ({ quiz }, ack) => {
      const parsed = QuizSchema.safeParse(quiz);
      if (!parsed.success) {
        ack({ error: parsed.error.issues.map((i) => i.message).join('; ') });
        return;
      }
      const game = manager.createGame(socket.id, parsed.data);
      socket.join(game.pin);
      ack({ pin: game.pin, hostToken: game.hostToken });
    });

    socket.on('host:rejoin', ({ pin, hostToken }, ack) => {
      const game = manager.get(pin);
      if (!game) {
        ack({ ok: false, error: 'That game is no longer running.' });
        return;
      }
      if (game.hostToken !== hostToken) {
        ack({ ok: false, error: 'Host session did not match this game.' });
        return;
      }
      game.hostSocketId = socket.id;
      game.hostConnected = true;
      if (game.hostGraceTimer) {
        clearTimeout(game.hostGraceTimer);
        game.hostGraceTimer = null;
      }
      socket.join(pin);
      ack({ ok: true });
      socket.emit('host:sync', buildHostSync(game));
      io.to(pin).emit('game:notice', { message: 'Host reconnected.' });
    });

    socket.on('host:startGame', () => {
      const game = manager.getByHost(socket.id);
      if (!game || game.phase !== 'lobby') return;
      startQuestion(game, 0);
    });

    socket.on('host:nextQuestion', () => {
      const game = manager.getByHost(socket.id);
      if (!game || game.phase !== 'reveal') return;
      const next = game.currentIndex + 1;
      if (next < game.quiz.questions.length) startQuestion(game, next);
      else gameOver(game);
    });

    socket.on('host:skipQuestion', () => {
      const game = manager.getByHost(socket.id);
      if (!game || game.phase !== 'question') return;
      endQuestion(game);
    });

    socket.on('host:endGame', () => {
      const game = manager.getByHost(socket.id);
      if (!game) return;
      gameOver(game);
    });

    socket.on('host:cancelGame', (ack) => {
      const game = manager.getByHost(socket.id);
      if (game) {
        clearTimers(game);
        if (game.hostGraceTimer) {
          clearTimeout(game.hostGraceTimer);
          game.hostGraceTimer = null;
        }
        // Everyone but the host; "ended" makes the players' banner offer a
        // way back to the start screen.
        socket.to(game.pin).emit('game:error', {
          message: 'The host ended this game.',
        });
        io.socketsLeave(game.pin);
        manager.remove(game.pin);
      }
      if (typeof ack === 'function') ack();
    });

    socket.on('player:join', ({ pin, nickname, avatar }, ack) => {
      const game = manager.get(pin);
      if (!game) {
        ack({ ok: false, error: 'Game not found. Check the PIN.' });
        return;
      }
      if (game.phase !== 'lobby') {
        ack({ ok: false, error: 'This game has already started.' });
        return;
      }
      const name = nickname.trim();
      if (!name) {
        ack({ ok: false, error: 'Please enter a nickname.' });
        return;
      }
      if (name.length > 20) {
        ack({ ok: false, error: 'Nickname must be 20 characters or fewer.' });
        return;
      }
      const taken = [...game.players.values()].some(
        (p) => p.nickname.toLowerCase() === name.toLowerCase(),
      );
      if (taken) {
        ack({ ok: false, error: 'That nickname is already taken.' });
        return;
      }

      const id = randomUUID();
      game.players.set(id, {
        id,
        nickname: name,
        // Keep the avatar id short and safe; the client resolves it to a glyph.
        avatar: typeof avatar === 'string' ? avatar.slice(0, 32) : '',
        socketId: socket.id,
        connected: true,
        score: 0,
        answered: false,
        answer: null,
        lastCorrect: false,
        lastPoints: 0,
        lastMatched: 0,
        streak: 0,
        lastStreakBonus: 0,
        rank: null,
        lastRankDelta: null,
        history: [],
      });
      socket.join(pin);
      ack({ ok: true, playerId: id });
      io.to(pin).emit('lobby:update', { players: lobbyPlayers(game) });
    });

    socket.on('player:rejoin', ({ pin, playerId }, ack) => {
      const game = manager.get(pin);
      if (!game) {
        ack({ ok: false, error: 'That game is no longer running.' });
        return;
      }
      const player = game.players.get(playerId);
      if (!player) {
        ack({ ok: false, error: 'Your spot in this game was not found.' });
        return;
      }
      player.socketId = socket.id;
      player.connected = true;
      socket.join(pin);
      ack({ ok: true, nickname: player.nickname, avatar: player.avatar || undefined });
      io.to(pin).emit('lobby:update', { players: lobbyPlayers(game) });
      // Bring this player's screen back to the current point in the game.
      socket.emit('state:sync', buildSync(game, player));
    });

    socket.on('player:answer', (data) => {
      const found = manager.findPlayerBySocket(socket.id);
      if (!found) return;
      const { game, player } = found;
      if (game.phase !== 'question') return;
      if (player.answered) return;

      const question = game.quiz.questions[game.currentIndex];
      if (!question) return;
      const answer = acceptAnswer(question, data, game.shuffle);
      if (!answer) return;

      player.answered = true;
      player.answer = answer;
      if (isGraded(question)) {
        const timeUsed = Date.now() - (game.questionStartedAt ?? Date.now());
        // 0–1; only puzzles land in between, earning that share of the points.
        const fraction = gradeAnswer(question, answer);
        player.lastCorrect = fraction === 1;
        if (question.type === 'puzzle') {
          player.lastMatched = Math.round(fraction * question.pairs.length);
        }
        const base = Math.round(
          computeScore(
            fraction > 0,
            timeUsed,
            question.timeLimitSec * 1000,
            DEFAULT_SCORE_CONFIG,
          ) * fraction,
        );
        // A correct answer extends the streak (and earns its bonus); a wrong one
        // breaks it. The streak carries across questions until broken.
        player.streak = player.lastCorrect ? player.streak + 1 : 0;
        player.lastStreakBonus = player.lastCorrect ? streakBonus(player.streak) : 0;
        player.lastPoints = base + player.lastStreakBonus;
      }
      // An open-ended answer can't be wrong: it scores nothing and leaves the
      // streak as it was.

      io.to(game.pin).emit('question:answered', answerProgress(game));

      // Only wait on players who are actually still connected, so a student who
      // dropped off doesn't hold up the reveal for everyone else.
      const connected = [...game.players.values()].filter((p) => p.connected);
      if (connected.length > 0 && connected.every((p) => p.answered)) {
        endQuestion(game);
      }
    });

    socket.on('disconnect', () => {
      const hostGame = manager.getByHost(socket.id);
      if (hostGame) {
        // Don't kill the game immediately — a host page reload should be able to
        // reclaim it. The question clock keeps running (the server is the source
        // of truth); we just start a grace timer that ends the game if the host
        // never comes back. `.unref()` so a pending timer can't keep the process
        // alive on its own.
        hostGame.hostConnected = false;
        io.to(hostGame.pin).emit('game:notice', {
          message: 'Host connection lost — trying to reconnect…',
          kind: 'warn',
        });
        hostGame.hostGraceTimer = setTimeout(() => {
          clearTimers(hostGame);
          io.to(hostGame.pin).emit('game:error', {
            message: 'The host disconnected. This game has ended.',
          });
          manager.remove(hostGame.pin);
        }, HOST_GRACE_MS);
        hostGame.hostGraceTimer.unref?.();
        return;
      }
      const found = manager.findPlayerBySocket(socket.id);
      if (found) {
        // Keep the player (and their score) so they can rejoin; just mark them
        // disconnected. Games are still ephemeral — this lives only in memory.
        found.player.connected = false;
        io.to(found.game.pin).emit('lobby:update', {
          players: lobbyPlayers(found.game),
        });
      }
    });
  });

  return manager;
}
