import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  QuizSchema,
  computeScore,
  streakBonus,
  DEFAULT_SCORE_CONFIG,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type PlayerSummary,
  type LeaderboardEntry,
  type PublicQuestion,
  type StateSync,
  type HostStateSync,
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
      const rank = ranked.findIndex((p) => p.id === player.id) + 1;
      return {
        phase: 'reveal',
        question: publicQuestion(game, game.currentIndex),
        remainingMs: 0,
        answered: player.answered,
        reveal: {
          correctIndex: q.correctIndex,
          distribution: distributionFor(game, q.options.length),
          leaderboard: leaderboard(game),
        },
        myResult: {
          correct: player.lastCorrect,
          pointsEarned: player.lastPoints,
          totalScore: player.score,
          rank,
          rankDelta: player.lastRankDelta,
          streak: player.streak,
          streakBonus: player.lastStreakBonus,
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
      avatar: p.avatar || undefined,
      delta: p.lastRankDelta,
    }));
  }

  /** Full snapshot for a reconnecting host, mirroring the live game state. */
  function buildHostSync(game: Game): HostStateSync {
    const q = game.quiz.questions[game.currentIndex];
    const base = {
      pin: game.pin,
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
      };
    }
    if (game.phase === 'reveal' && q) {
      return {
        ...base,
        phase: 'reveal',
        question: publicQuestion(game, game.currentIndex),
        remainingMs: 0,
        reveal: {
          correctIndex: q.correctIndex,
          distribution: distributionFor(game, q.options.length),
          leaderboard: leaderboard(game),
        },
        finalLeaderboard: null,
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
      };
    }
    return {
      ...base,
      phase: 'lobby',
      question: null,
      remainingMs: 0,
      reveal: null,
      finalLeaderboard: null,
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
    for (const p of game.players.values()) {
      p.answered = false;
      p.answerIndex = null;
      p.lastCorrect = false;
      p.lastPoints = 0;
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

    for (const p of game.players.values()) p.score += p.lastPoints;
    const distribution = distributionFor(game, question.options.length);

    // Recompute standings, then record each player's rank movement vs the
    // previous reveal before overwriting their stored rank.
    const ranked = sortedPlayers(game);
    ranked.forEach((p, i) => {
      const newRank = i + 1;
      p.lastRankDelta = p.rank == null ? null : p.rank - newRank;
      p.rank = newRank;
    });
    const lb = leaderboard(game);

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
        rank: p.rank ?? 0,
        rankDelta: p.lastRankDelta,
        streak: p.streak,
        streakBonus: p.lastStreakBonus,
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
        answerIndex: null,
        lastCorrect: false,
        lastPoints: 0,
        streak: 0,
        lastStreakBonus: 0,
        rank: null,
        lastRankDelta: null,
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
      const base = computeScore(
        player.lastCorrect,
        timeUsed,
        question.timeLimitSec * 1000,
        DEFAULT_SCORE_CONFIG,
      );
      // A correct answer extends the streak (and earns its bonus); a wrong one
      // breaks it. The streak carries across questions until broken.
      player.streak = player.lastCorrect ? player.streak + 1 : 0;
      player.lastStreakBonus = player.lastCorrect ? streakBonus(player.streak) : 0;
      player.lastPoints = base + player.lastStreakBonus;

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
