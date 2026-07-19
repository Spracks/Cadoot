import type { Quiz, QuestionType } from './quiz';

/**
 * The version of a question that is safe to send to players. Crucially it does
 * NOT contain `correctIndex` — clients never learn the answer until reveal.
 */
export interface PublicQuestion {
  /** 0-based position in the quiz. */
  index: number;
  total: number;
  text: string;
  type: QuestionType;
  options: string[];
  timeLimitSec: number;
}

export interface PlayerSummary {
  id: string;
  nickname: string;
  connected: boolean;
  /** Chosen avatar id (see the client's avatar registry). Optional scaffold. */
  avatar?: string;
}

export interface LeaderboardEntry {
  nickname: string;
  score: number;
  rank: number;
  avatar?: string;
  /**
   * Change in rank since the previous reveal: positive = moved up, negative =
   * moved down, 0 = unchanged, null = no previous standing (first reveal).
   */
  delta?: number | null;
}

/** A player's personal result for one question, shown on their own device. */
export interface PersonalResult {
  correct: boolean;
  pointsEarned: number;
  totalScore: number;
  rank: number;
  /** Rank change vs the previous reveal (positive = up). null on first reveal. */
  rankDelta: number | null;
  /** Consecutive correct answers, including this one (0 if this was wrong). */
  streak: number;
  /** Portion of pointsEarned that came from the streak bonus. */
  streakBonus: number;
}

/** Count of answers received per option index. */
export type AnswerDistribution = number[];

/**
 * A full snapshot of the current game state for one player, sent when they
 * (re)connect so their screen can jump straight to the right place mid-game.
 */
export interface StateSync {
  phase: 'lobby' | 'question' | 'reveal' | 'over';
  question: PublicQuestion | null;
  remainingMs: number;
  /** Whether this player already answered the current question. */
  answered: boolean;
  reveal: {
    correctIndex: number;
    distribution: AnswerDistribution;
    leaderboard: LeaderboardEntry[];
  } | null;
  myResult: PersonalResult | null;
  finalLeaderboard: LeaderboardEntry[] | null;
}

/**
 * A full snapshot for a (re)connecting HOST, so a projector-laptop reload drops
 * the host screen straight back into the running game. Unlike a player's sync,
 * the host is allowed to see the correct answer at reveal.
 */
export interface HostStateSync {
  pin: string;
  phase: 'lobby' | 'question' | 'reveal' | 'over';
  players: PlayerSummary[];
  /** How many connected players have locked in an answer this question. */
  answeredCount: number;
  question: PublicQuestion | null;
  remainingMs: number;
  reveal: {
    correctIndex: number;
    distribution: AnswerDistribution;
    leaderboard: LeaderboardEntry[];
  } | null;
  finalLeaderboard: LeaderboardEntry[] | null;
}

export interface CreateGameAck {
  pin?: string;
  /** Secret token the host stores to reclaim this game after a reload. */
  hostToken?: string;
  error?: string;
}

export type JoinAck =
  | { ok: true; playerId: string }
  | { ok: false; error: string };

/** Events the server emits to clients (hosts and players). */
export interface ServerToClientEvents {
  'game:error': (data: { message: string }) => void;
  /** Transient, non-fatal message (e.g. "host reconnected"). */
  'game:notice': (data: { message: string; kind?: 'info' | 'warn' }) => void;
  'lobby:update': (data: { players: PlayerSummary[] }) => void;
  'question:show': (data: PublicQuestion) => void;
  'question:tick': (data: { remainingMs: number }) => void;
  /** Live count of how many connected players have answered this question. */
  'question:answered': (data: { answered: number; total: number }) => void;
  'question:results': (data: {
    correctIndex: number;
    distribution: AnswerDistribution;
    leaderboard: LeaderboardEntry[];
  }) => void;
  /** Personal per-player result, sent only to that player at reveal. */
  'answer:result': (data: PersonalResult) => void;
  'game:over': (data: { leaderboard: LeaderboardEntry[] }) => void;
  'state:sync': (data: StateSync) => void;
  /** Full host snapshot after a host reconnect. */
  'host:sync': (data: HostStateSync) => void;
}

/** Events clients send to the server. */
export interface ClientToServerEvents {
  'host:createGame': (
    data: { quiz: Quiz },
    ack: (res: CreateGameAck) => void,
  ) => void;
  'host:startGame': () => void;
  'host:nextQuestion': () => void;
  'host:skipQuestion': () => void;
  'host:endGame': () => void;
  /** Reclaim a game after a host-page reload, using the stored host token. */
  'host:rejoin': (
    data: { pin: string; hostToken: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'player:join': (
    data: { pin: string; nickname: string; avatar?: string },
    ack: (res: JoinAck) => void,
  ) => void;
  'player:rejoin': (
    data: { pin: string; playerId: string },
    ack: (
      res:
        | { ok: true; nickname: string; avatar?: string }
        | { ok: false; error: string },
    ) => void,
  ) => void;
  'player:answer': (data: { optionIndex: number }) => void;
}
