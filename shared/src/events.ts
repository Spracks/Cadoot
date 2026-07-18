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
}

export interface LeaderboardEntry {
  nickname: string;
  score: number;
  rank: number;
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
  myResult: {
    correct: boolean;
    pointsEarned: number;
    totalScore: number;
    rank: number;
  } | null;
  finalLeaderboard: LeaderboardEntry[] | null;
}

export interface CreateGameAck {
  pin?: string;
  error?: string;
}

export type JoinAck =
  | { ok: true; playerId: string }
  | { ok: false; error: string };

/** Events the server emits to clients (hosts and players). */
export interface ServerToClientEvents {
  'game:error': (data: { message: string }) => void;
  'lobby:update': (data: { players: PlayerSummary[] }) => void;
  'question:show': (data: PublicQuestion) => void;
  'question:tick': (data: { remainingMs: number }) => void;
  'question:results': (data: {
    correctIndex: number;
    distribution: AnswerDistribution;
    leaderboard: LeaderboardEntry[];
  }) => void;
  /** Personal per-player result, sent only to that player at reveal. */
  'answer:result': (data: {
    correct: boolean;
    pointsEarned: number;
    totalScore: number;
    rank: number;
  }) => void;
  'game:over': (data: { leaderboard: LeaderboardEntry[] }) => void;
  'state:sync': (data: StateSync) => void;
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
  'player:join': (
    data: { pin: string; nickname: string },
    ack: (res: JoinAck) => void,
  ) => void;
  'player:rejoin': (
    data: { pin: string; playerId: string },
    ack: (res: { ok: true; nickname: string } | { ok: false; error: string }) => void,
  ) => void;
  'player:answer': (data: { optionIndex: number }) => void;
}
