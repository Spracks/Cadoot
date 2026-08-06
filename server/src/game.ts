import { randomUUID } from 'node:crypto';
import type { Quiz } from '@cadoot/shared';

/**
 * What one player did on one scored question. Appended at reveal so the
 * post-game review can replay the whole game — the `last*` fields below only
 * ever describe the question in progress.
 */
export interface AnswerRecord {
  questionIndex: number;
  /** Option picked, or null if they ran out of time. */
  answerIndex: number | null;
  correct: boolean;
  points: number;
}

export interface Player {
  id: string;
  nickname: string;
  avatar: string;
  socketId: string;
  connected: boolean;
  score: number;
  answered: boolean;
  answerIndex: number | null;
  lastCorrect: boolean;
  lastPoints: number;
  /** Running count of consecutive correct answers (0 after a wrong answer). */
  streak: number;
  /** Streak-bonus portion of the most recent question's points. */
  lastStreakBonus: number;
  /** Rank at the previous reveal (null before the first reveal). */
  rank: number | null;
  /** Rank change at the most recent reveal (positive = moved up). */
  lastRankDelta: number | null;
  /** One entry per scored question, in play order. Feeds the study sheet. */
  history: AnswerRecord[];
}

export type GamePhase = 'lobby' | 'question' | 'reveal' | 'over';

export interface Game {
  pin: string;
  hostSocketId: string;
  /** Secret the host presents to reclaim the game after a page reload. */
  hostToken: string;
  hostConnected: boolean;
  /** Ends the game if the host doesn't reconnect within the grace window. */
  hostGraceTimer: ReturnType<typeof setTimeout> | null;
  quiz: Quiz;
  players: Map<string, Player>;
  phase: GamePhase;
  currentIndex: number;
  /**
   * How many questions have actually been revealed and scored. Always a prefix
   * of the quiz — a game ended mid-question leaves that question out.
   */
  questionsScored: number;
  /** Epoch ms the game ended, so post-game downloads carry a stable date. */
  finishedAt: number | null;
  questionStartedAt: number | null;
  questionTimer: ReturnType<typeof setTimeout> | null;
  tickTimer: ReturnType<typeof setInterval> | null;
}

/**
 * Owns all live games in memory. Nothing is persisted — when the process exits
 * or a host disconnects, the game is gone (by design: "pure ephemeral").
 */
export class GameManager {
  private games = new Map<string, Game>();

  createGame(hostSocketId: string, quiz: Quiz): Game {
    const game: Game = {
      pin: this.newPin(),
      hostSocketId,
      hostToken: randomUUID(),
      hostConnected: true,
      hostGraceTimer: null,
      quiz,
      players: new Map(),
      phase: 'lobby',
      currentIndex: -1,
      questionsScored: 0,
      finishedAt: null,
      questionStartedAt: null,
      questionTimer: null,
      tickTimer: null,
    };
    this.games.set(game.pin, game);
    return game;
  }

  private newPin(): string {
    let pin: string;
    do {
      pin = String(Math.floor(100000 + Math.random() * 900000));
    } while (this.games.has(pin));
    return pin;
  }

  get(pin: string): Game | undefined {
    return this.games.get(pin);
  }

  getByHost(socketId: string): Game | undefined {
    for (const game of this.games.values()) {
      if (game.hostSocketId === socketId) return game;
    }
    return undefined;
  }

  findPlayerBySocket(socketId: string): { game: Game; player: Player } | undefined {
    for (const game of this.games.values()) {
      for (const player of game.players.values()) {
        if (player.socketId === socketId) return { game, player };
      }
    }
    return undefined;
  }

  remove(pin: string): void {
    this.games.delete(pin);
  }

  get count(): number {
    return this.games.size;
  }
}
