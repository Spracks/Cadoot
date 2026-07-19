import { create } from 'zustand';
import type {
  LeaderboardEntry,
  PersonalResult,
  PlayerSummary,
  PublicQuestion,
  Quiz,
} from '@cadoot/shared';
import { socket } from './socket';
import { initSoundFromStorage, setSoundEnabled } from './sound';
import { DEFAULT_AVATAR } from './avatars';

export type Role = 'none' | 'host' | 'player';
export type ServerPhase = 'lobby' | 'question' | 'reveal' | 'over';

interface RevealData {
  correctIndex: number;
  distribution: number[];
  leaderboard: LeaderboardEntry[];
}

interface State {
  role: Role;
  pin: string | null;
  players: PlayerSummary[];
  serverPhase: ServerPhase | null;
  question: PublicQuestion | null;
  remainingMs: number;
  answeredProgress: { answered: number; total: number } | null;
  reveal: RevealData | null;
  myResult: PersonalResult | null;
  finalLeaderboard: LeaderboardEntry[] | null;
  hasAnswered: boolean;
  myNickname: string | null;
  myAvatar: string;
  error: string | null;
  notice: string | null;
  soundOn: boolean;

  setRole: (role: Role) => void;
  setMyAvatar: (avatar: string) => void;
  toggleSound: () => void;
  hostCreate: (quiz: Quiz) => Promise<void>;
  startGame: () => void;
  nextQuestion: () => void;
  skipQuestion: () => void;
  endGame: () => void;
  join: (pin: string, nickname: string, avatar: string) => Promise<void>;
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
const HOST_SESSION_KEY = 'cadoot.host';

interface Session {
  pin: string;
  playerId: string;
  nickname: string;
  avatar: string;
}
interface HostSession {
  pin: string;
  hostToken: string;
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

function saveHostSession(s: HostSession): void {
  try {
    localStorage.setItem(HOST_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function loadHostSession(): HostSession | null {
  try {
    const raw = localStorage.getItem(HOST_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as HostSession;
    return s.pin && s.hostToken ? s : null;
  } catch {
    return null;
  }
}
function clearHostSession(): void {
  try {
    localStorage.removeItem(HOST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export const useStore = create<State>((set, get) => {
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  function flashNotice(message: string) {
    set({ notice: message });
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => set({ notice: null }), 4000);
  }

  // Register socket listeners once, when the store is first created.
  socket.on('lobby:update', ({ players }) => set({ players }));

  socket.on('question:show', (question) =>
    set({
      question,
      serverPhase: 'question',
      hasAnswered: false,
      remainingMs: question.timeLimitSec * 1000,
      answeredProgress: null,
      reveal: null,
      myResult: null,
    }),
  );

  socket.on('question:tick', ({ remainingMs }) => set({ remainingMs }));

  socket.on('question:answered', (answeredProgress) => set({ answeredProgress }));

  socket.on('question:results', (reveal) =>
    set({ reveal, serverPhase: 'reveal', remainingMs: 0 }),
  );

  socket.on('answer:result', (myResult) => set({ myResult }));

  socket.on('game:over', ({ leaderboard }) =>
    set({ finalLeaderboard: leaderboard, serverPhase: 'over' }),
  );

  socket.on('game:error', ({ message }) => set({ error: message }));
  socket.on('game:notice', ({ message }) => flashNotice(message));

  // Full-state snapshot after a player (re)connect — jump their screen to the
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

  // Full-state snapshot after a HOST reconnect (e.g. projector-laptop reload).
  socket.on('host:sync', (s) =>
    set({
      role: 'host',
      pin: s.pin,
      players: s.players,
      serverPhase: s.phase,
      question: s.question,
      remainingMs: s.remainingMs,
      answeredProgress: {
        answered: s.answeredCount,
        total: s.players.filter((p) => p.connected).length,
      },
      reveal: s.reveal,
      finalLeaderboard: s.finalLeaderboard,
      error: null,
    }),
  );

  // Recover a dropped player OR host: whenever the socket (re)connects, if we
  // have a saved session, ask the server to put us back in the game.
  function maybeRejoin() {
    if (get().role === 'host') return;
    const session = loadSession();
    if (!session) return;
    socket.emit(
      'player:rejoin',
      { pin: session.pin, playerId: session.playerId },
      (res) => {
        if (res.ok) {
          set({
            role: 'player',
            pin: session.pin,
            myNickname: res.nickname,
            myAvatar: res.avatar ?? session.avatar,
          });
        } else {
          clearSession();
        }
      },
    );
  }
  function maybeRejoinHost() {
    if (get().role === 'player') return;
    const hs = loadHostSession();
    if (!hs) return;
    socket.emit('host:rejoin', { pin: hs.pin, hostToken: hs.hostToken }, (res) => {
      if (res.ok) {
        // host:sync populates the rest of the state.
        set({ role: 'host', pin: hs.pin });
      } else {
        clearHostSession();
      }
    });
  }
  socket.on('connect', () => {
    maybeRejoinHost();
    maybeRejoin();
  });
  if (socket.connected) {
    maybeRejoinHost();
    maybeRejoin();
  }

  return {
    role: 'none',
    pin: null,
    players: [],
    serverPhase: null,
    question: null,
    remainingMs: 0,
    answeredProgress: null,
    reveal: null,
    myResult: null,
    finalLeaderboard: null,
    hasAnswered: false,
    myNickname: null,
    myAvatar: DEFAULT_AVATAR,
    error: null,
    notice: null,
    soundOn: initSoundFromStorage(),

    setRole: (role) => set({ role }),
    setMyAvatar: (avatar) => set({ myAvatar: avatar }),

    toggleSound: () => {
      const on = !get().soundOn;
      setSoundEnabled(on);
      set({ soundOn: on });
    },

    hostCreate: (quiz) =>
      new Promise<void>((resolve, reject) => {
        socket.emit('host:createGame', { quiz }, (res) => {
          if (res.pin) {
            if (res.hostToken) {
              saveHostSession({ pin: res.pin, hostToken: res.hostToken });
            }
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

    join: (pin, nickname, avatar) =>
      new Promise<void>((resolve, reject) => {
        socket.emit('player:join', { pin, nickname, avatar }, (res) => {
          if (res.ok) {
            saveSession({ pin, playerId: res.playerId, nickname, avatar });
            set({
              role: 'player',
              pin,
              myNickname: nickname,
              myAvatar: avatar,
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
      clearHostSession();
      if (typeof window !== 'undefined') window.location.href = '/';
    },
  };
});
