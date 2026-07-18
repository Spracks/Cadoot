import { create } from 'zustand';
import type {
  LeaderboardEntry,
  PlayerSummary,
  PublicQuestion,
  Quiz,
} from '@cadoot/shared';
import { socket } from './socket';
import { initSoundFromStorage, setSoundEnabled } from './sound';

export type Role = 'none' | 'host' | 'player';
export type ServerPhase = 'lobby' | 'question' | 'reveal' | 'over';

interface RevealData {
  correctIndex: number;
  distribution: number[];
  leaderboard: LeaderboardEntry[];
}

interface MyResult {
  correct: boolean;
  pointsEarned: number;
  totalScore: number;
  rank: number;
}

interface State {
  role: Role;
  pin: string | null;
  players: PlayerSummary[];
  serverPhase: ServerPhase | null;
  question: PublicQuestion | null;
  remainingMs: number;
  reveal: RevealData | null;
  myResult: MyResult | null;
  finalLeaderboard: LeaderboardEntry[] | null;
  hasAnswered: boolean;
  myNickname: string | null;
  error: string | null;
  soundOn: boolean;

  setRole: (role: Role) => void;
  toggleSound: () => void;
  hostCreate: (quiz: Quiz) => Promise<void>;
  startGame: () => void;
  nextQuestion: () => void;
  skipQuestion: () => void;
  endGame: () => void;
  join: (pin: string, nickname: string) => Promise<void>;
  answer: (optionIndex: number) => void;
  clearError: () => void;
  reset: () => void;
}

/** The pin passed via ?pin=XXXXXX (from a scanned QR code), if any. */
export function getInitialPin(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('pin');
}

const SESSION_KEY = 'cadoot.session';
interface Session {
  pin: string;
  playerId: string;
  nickname: string;
}

function saveSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — reconnection just won't persist across reloads */
  }
}
function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s.pin && s.playerId ? s : null;
  } catch {
    return null;
  }
}
function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export const useStore = create<State>((set, get) => {
  // Register socket listeners once, when the store is first created.
  socket.on('lobby:update', ({ players }) => set({ players }));

  socket.on('question:show', (question) =>
    set({
      question,
      serverPhase: 'question',
      hasAnswered: false,
      remainingMs: question.timeLimitSec * 1000,
      reveal: null,
      myResult: null,
    }),
  );

  socket.on('question:tick', ({ remainingMs }) => set({ remainingMs }));

  socket.on('question:results', (reveal) =>
    set({ reveal, serverPhase: 'reveal', remainingMs: 0 }),
  );

  socket.on('answer:result', (myResult) => set({ myResult }));

  socket.on('game:over', ({ leaderboard }) =>
    set({ finalLeaderboard: leaderboard, serverPhase: 'over' }),
  );

  socket.on('game:error', ({ message }) => set({ error: message }));

  // Full-state snapshot after a (re)connect — jump the player's screen to the
  // right place mid-game.
  socket.on('state:sync', (s) =>
    set({
      role: 'player',
      serverPhase: s.phase,
      question: s.question,
      remainingMs: s.remainingMs,
      hasAnswered: s.answered,
      reveal: s.reveal,
      myResult: s.myResult,
      finalLeaderboard: s.finalLeaderboard,
    }),
  );

  // Recover a dropped player: whenever the socket (re)connects, if we have a
  // saved session, ask the server to put us back in the game.
  function maybeRejoin() {
    if (get().role === 'host') return;
    const session = loadSession();
    if (!session) return;
    socket.emit(
      'player:rejoin',
      { pin: session.pin, playerId: session.playerId },
      (res) => {
        if (res.ok) {
          set({ role: 'player', pin: session.pin, myNickname: res.nickname });
        } else {
          clearSession();
        }
      },
    );
  }
  socket.on('connect', maybeRejoin);
  if (socket.connected) maybeRejoin();

  return {
    role: 'none',
    pin: null,
    players: [],
    serverPhase: null,
    question: null,
    remainingMs: 0,
    reveal: null,
    myResult: null,
    finalLeaderboard: null,
    hasAnswered: false,
    myNickname: null,
    error: null,
    soundOn: initSoundFromStorage(),

    setRole: (role) => set({ role }),

    toggleSound: () => {
      const on = !get().soundOn;
      setSoundEnabled(on);
      set({ soundOn: on });
    },

    hostCreate: (quiz) =>
      new Promise<void>((resolve, reject) => {
        socket.emit('host:createGame', { quiz }, (res) => {
          if (res.pin) {
            set({ role: 'host', pin: res.pin, serverPhase: 'lobby', error: null });
            resolve();
          } else {
            const message = res.error ?? 'Could not create the game.';
            set({ error: message });
            reject(new Error(message));
          }
        });
      }),

    startGame: () => socket.emit('host:startGame'),
    nextQuestion: () => socket.emit('host:nextQuestion'),
    skipQuestion: () => socket.emit('host:skipQuestion'),
    endGame: () => socket.emit('host:endGame'),

    join: (pin, nickname) =>
      new Promise<void>((resolve, reject) => {
        socket.emit('player:join', { pin, nickname }, (res) => {
          if (res.ok) {
            saveSession({ pin, playerId: res.playerId, nickname });
            set({
              role: 'player',
              pin,
              myNickname: nickname,
              serverPhase: 'lobby',
              error: null,
            });
            resolve();
          } else {
            set({ error: res.error });
            reject(new Error(res.error));
          }
        });
      }),

    answer: (optionIndex) => {
      if (get().hasAnswered) return;
      socket.emit('player:answer', { optionIndex });
      set({ hasAnswered: true });
    },

    clearError: () => set({ error: null }),

    reset: () => {
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/';
    },
  };
});
