import type { ChoiceType, PuzzlePair, Quiz, QuestionType } from './quiz';

/**
 * The version of a question that is safe to send to players. Crucially it does
 * NOT contain the answer key — clients never learn the answer until reveal.
 */
export interface PublicQuestion {
  /** 0-based position in the quiz. */
  index: number;
  total: number;
  text: string;
  type: QuestionType;
  /**
   * Choice questions: the tiles. Puzzles: the right-hand items, shuffled so
   * none starts beside its partner. Empty for typed-answer questions.
   */
  options: string[];
  /** Puzzles only: the left-hand items, in authored order. */
  prompts?: string[];
  timeLimitSec: number;
}

/**
 * What a player sends for each question type:
 * - choice:  the option tile they tapped
 * - fill / open: what they typed
 * - puzzle:  for each prompt (in order), the index into the shown `options`
 *            they placed beside it — a permutation of 0..n-1
 */
export type AnswerPayload =
  | { optionIndex: number }
  | { text: string }
  | { order: number[] };

/** Typed answers grouped by their normalized form, most common first. */
export interface ResponseTally {
  /** The most common spelling seen for this group. */
  text: string;
  count: number;
  /** Fill-in-the-blank only: whether this response was accepted. */
  correct?: boolean;
}

/**
 * The answer key plus how the class answered, per question type. Shown at
 * reveal and repeated in the host's post-game report.
 */
export type QuestionOutcome =
  | {
      type: ChoiceType;
      options: string[];
      correctIndex: number;
      /** Answers received per option index. */
      distribution: AnswerDistribution;
    }
  | { type: 'fill'; answers: string[]; responses: ResponseTally[] }
  | { type: 'open'; responses: ResponseTally[] }
  | {
      type: 'puzzle';
      pairs: PuzzlePair[];
      /** For each pair, how many players matched it correctly. */
      pairCorrect: number[];
    };

/** Everything the shared screen shows when a question is revealed. */
export type RevealData = QuestionOutcome & {
  /** Players who got the question fully right (0 for open-ended). */
  correctCount: number;
  leaderboard: LeaderboardEntry[];
  /** Ceiling a flawless player could hold by now; scales the host's bars. */
  maxPossible: number;
};

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
  /**
   * Points earned on the question just revealed. Lets the host animate each
   * score up from `score - gained` (where the player stood going into the
   * question) to `score`. 0 when no question has been scored yet.
   */
  gained?: number;
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
  /** Puzzles only: how many pairs this player matched correctly. */
  matched?: { count: number; total: number };
}

/** Count of answers received per option index. */
export type AnswerDistribution = number[];

/**
 * The answer key for one question and the answer one player gave, per type.
 * Every "their answer" field is null when the player never answered.
 */
export type ReviewDetail =
  | {
      type: ChoiceType;
      options: string[];
      correctIndex: number;
      answerIndex: number | null;
    }
  | { type: 'fill'; answers: string[]; answerText: string | null }
  | { type: 'open'; answerText: string | null }
  | {
      type: 'puzzle';
      pairs: PuzzlePair[];
      /**
       * For each pair (in order), the index of the pair whose `right` this
       * player placed beside it. A perfect answer is [0, 1, 2, …].
       */
      answerOrder: number[] | null;
    };

/**
 * One question as it appeared to a single player, with the answer they gave.
 *
 * This is the ONE place a player's device is sent the answer key — the game is
 * over and every question here has already been revealed on the shared screen,
 * so nothing is leaked that the player hasn't already seen.
 */
export type ReviewAnswer = ReviewDetail & {
  /** 0-based position in the quiz. */
  questionIndex: number;
  text: string;
  answered: boolean;
  correct: boolean;
  pointsEarned: number;
};

/**
 * A player's own post-game review — everything their downloadable study sheet
 * is built from. Sent only to that player, once the game is over.
 */
export interface PersonalReview {
  quizTitle: string;
  /** Epoch ms when the game ended; stamps the downloaded file. */
  finishedAt: number;
  nickname: string;
  rank: number;
  totalPlayers: number;
  score: number;
  correctCount: number;
  /** How many of `answers` were graded (open-ended questions aren't). */
  gradedCount: number;
  /** One entry per question that was actually scored, in play order. */
  answers: ReviewAnswer[];
}

/** How the class as a whole did on one question. */
export type QuestionStat = QuestionOutcome & {
  questionIndex: number;
  text: string;
  correctCount: number;
  /** Players who never answered this question. */
  noAnswerCount: number;
  /** Share of all players who got it right, 0–1 (0 for open-ended). */
  accuracy: number;
};

/** One row of the host's final standings. */
export interface StandingsRow {
  rank: number;
  nickname: string;
  score: number;
  correctCount: number;
}

/**
 * The host's post-game class report: final standings plus per-question class
 * accuracy — enough to see which questions need reteaching. Deliberately
 * aggregate: it does not break out who answered what.
 */
export interface HostReport {
  quizTitle: string;
  finishedAt: number;
  playerCount: number;
  standings: StandingsRow[];
  questions: QuestionStat[];
}

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
  reveal: RevealData | null;
  myResult: PersonalResult | null;
  finalLeaderboard: LeaderboardEntry[] | null;
  /** Downloadable post-game review; only present once the game is over. */
  review: PersonalReview | null;
}

/**
 * A full snapshot for a (re)connecting HOST, so a projector-laptop reload drops
 * the host screen straight back into the running game. Unlike a player's sync,
 * the host is allowed to see the correct answer at reveal.
 */
export interface HostStateSync {
  pin: string;
  quizTitle: string;
  phase: 'lobby' | 'question' | 'reveal' | 'over';
  players: PlayerSummary[];
  /** How many connected players have locked in an answer this question. */
  answeredCount: number;
  question: PublicQuestion | null;
  remainingMs: number;
  reveal: RevealData | null;
  finalLeaderboard: LeaderboardEntry[] | null;
  /** Downloadable class report; only present once the game is over. */
  report: HostReport | null;
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
  'question:results': (data: RevealData) => void;
  /** Personal per-player result, sent only to that player at reveal. */
  'answer:result': (data: PersonalResult) => void;
  'game:over': (data: { leaderboard: LeaderboardEntry[] }) => void;
  /** Post-game study material, sent only to the player it describes. */
  'results:review': (data: PersonalReview) => void;
  /** Post-game class report, sent only to the host. */
  'results:report': (data: HostReport) => void;
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
  /** Close the game outright (no results) so it can't be rejoined. */
  'host:cancelGame': (ack: () => void) => void;
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
  'player:answer': (data: AnswerPayload) => void;
}
