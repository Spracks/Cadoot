import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  QuizSchema,
  computeScore,
  DEFAULT_SCORE_CONFIG,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type PlayerSummary,
  type LeaderboardEntry,
  type PublicQuestion,
  type StateSync,
} from '@cadoot/shared';
import { GameManager, type Game, type Player } from './game';

const TICK_MS = 250;

type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerHandlers(io: IoServer): GameManager {
  const manager = new GameManager();

  function lobbyPlayers(game: Game): PlayerSummary[] {
    return [...game.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      connected: p.connected,
    }));
  }

  function publicQuestion(game: Game, index: number): PublicQuestion {
    const q = game.quiz.questions[index]!;
    return {
      index,
      total: game.quiz.questions.length,
      text: q.text,
      type: q.type,
      options: q.options,
      timeLimitSec: q.timeLimitSec,
    };
  }

  function remainingMs(game: Game): number {
    const q = game.quiz.questions[game.currentIndex];
    if (!q || game.questionStartedAt == null) return 0;
    return Math.max(0, q.timeLimitSec * 1000 - (Date.now() - game.questionStartedAt));
  }

  function distributionFor(game: Game, optionCount: number): number[] {
    const dist = new Array<number>(optionCount).fill(0);
    for (const p of game.players.values()) {
      if (p.answerIndex !== null && p.answerIndex < dist.length) {
        dist[p.answerIndex] = (dist[p.answerIndex] ?? 0) + 1;
      }
    }
    return dist;
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
      };
    }
    if (game.phase === 'reveal' && q) {
      const ranked = sortedPlayers(game);
      const lb = ranked.map((p, i) => ({ nickname: p.nickname, score: p.score, rank: i + 1 }));
      const rank = ranked.findIndex((p) => p.id === player.id) + 1;
      return {
        phase: 'reveal',
        question: publicQuestion(game, game.currentIndex),
        remainingMs: 0,
        answered: player.answered,
        reveal: {
          correctIndex: q.correctIndex,
          distribution: distributionFor(game, q.options.length),
          leaderboard: lb,
        },
        myResult: {
          correct: player.lastCorrect,
          pointsEarned: player.lastPoints,
          totalScore: player.score,
          rank,
        },
        finalLeaderboard: null,
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
    };
  }

  function sortedPlayers(game: Game): Player[] {
    return [...game.players.values()].sort((a, b) => b.score - a.score);
  }

  function leaderboard(game: Game): LeaderboardEntry[] {
    return sortedPlayers(game).map((p, i) => ({
      nickname: p.nickname,
      score: p.score,
      rank: i + 1,
    }));
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
    for (const p of game.players.values()) {
      p.answered = false;
      p.answerIndex = null;
      p.lastCorrect = false;
      p.lastPoints = 0;
    }

    io.to(game.pin).emit('question:show', publicQuestion(game, index));

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

    for (const p of game.players.values()) p.score += p.lastPoints;
    const distribution = distributionFor(game, question.options.length);

    const ranked = sortedPlayers(game);
    const lb: LeaderboardEntry[] = ranked.map((p, i) => ({
      nickname: p.nickname,
      score: p.score,
      rank: i + 1,
    }));
    const rankById = new Map(ranked.map((p, i) => [p.id, i + 1]));

    io.to(game.pin).emit('question:results', {
      correctIndex: question.correctIndex,
      distribution,
      leaderboard: lb,
    });

    for (const p of game.players.values()) {
      io.to(p.socketId).emit('answer:result', {
        correct: p.lastCorrect,
        pointsEarned: p.lastPoints,
        totalScore: p.score,
        rank: rankById.get(p.id) ?? 0,
      });
    }
  }

  function gameOver(game: Game): void {
    clearTimers(game);
    game.phase = 'over';
    io.to(game.pin).emit('game:over', { leaderboard: leaderboard(game) });
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
      ack({ pin: game.pin });
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

    socket.on('player:join', ({ pin, nickname }, ack) => {
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
        socketId: socket.id,
        connected: true,
        score: 0,
        answered: false,
        answerIndex: null,
        lastCorrect: false,
        lastPoints: 0,
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
      ack({ ok: true, nickname: player.nickname });
      io.to(pin).emit('lobby:update', { players: lobbyPlayers(game) });
      // Bring this player's screen back to the current point in the game.
      socket.emit('state:sync', buildSync(game, player));
    });

    socket.on('player:answer', ({ optionIndex }) => {
      const found = manager.findPlayerBySocket(socket.id);
      if (!found) return;
      const { game, player } = found;
      if (game.phase !== 'question') return;
      if (player.answered) return;

      const question = game.quiz.questions[game.currentIndex];
      if (!question) return;
      if (optionIndex < 0 || optionIndex >= question.options.length) return;

      player.answered = true;
      player.answerIndex = optionIndex;
      const timeUsed = Date.now() - (game.questionStartedAt ?? Date.now());
      player.lastCorrect = optionIndex === question.correctIndex;
      player.lastPoints = computeScore(
        player.lastCorrect,
        timeUsed,
        question.timeLimitSec * 1000,
        DEFAULT_SCORE_CONFIG,
      );

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
        clearTimers(hostGame);
        io.to(hostGame.pin).emit('game:error', {
          message: 'The host disconnected. This game has ended.',
        });
        manager.remove(hostGame.pin);
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
