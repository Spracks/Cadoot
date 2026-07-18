import type { Quiz } from '@cadoot/shared';

export interface Player {
  id: string;
  nickname: string;
  socketId: string;
  connected: boolean;
  score: number;
  answered: boolean;
  answerIndex: number | null;
  lastCorrect: boolean;
  lastPoints: number;
}

export type GamePhase = 'lobby' | 'question' | 'reveal' | 'over';

export interface Game {
  pin: string;
  hostSocketId: string;
  quiz: Quiz;
  players: Map<string, Player>;
  phase: GamePhase;
  currentIndex: number;
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
      quiz,
      players: new Map(),
      phase: 'lobby',
      currentIndex: -1,
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
