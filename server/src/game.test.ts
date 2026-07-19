import { describe, it, expect } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Quiz,
} from '@cadoot/shared';
import { registerHandlers } from './handlers';

function once<T = any>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as never));
}

async function setup() {
  const httpServer: HttpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  registerHandlers(io);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  const teardown = () => {
    io.close();
    httpServer.close();
  };
  return { url, teardown };
}

function connect(url: string): ClientSocket {
  return ioc(url, { transports: ['websocket'], forceNew: true });
}

const QUIZ: Quiz = {
  title: 'Integration',
  questions: [
    { text: 'Q1', type: 'multiple', options: ['a', 'b', 'c', 'd'], correctIndex: 0, timeLimitSec: 30 },
    { text: 'Q2', type: 'multiple', options: ['x', 'y'], correctIndex: 1, timeLimitSec: 30 },
  ],
};

describe('game flow (end-to-end over sockets)', () => {
  it('creates a game, joins players, scores, and ends', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);

    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      expect(created.pin).toMatch(/^\d{6}$/);
      const pin = created.pin as string;

      const aliceJoin = await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      const bobJoin = await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });
      expect(aliceJoin.ok).toBe(true);
      expect(bobJoin.ok).toBe(true);

      // Host sees both players in the lobby.
      const lobbyPromise = once<{ players: unknown[] }>(host, 'lobby:update');
      // (lobby:update already fired on join; grab the current one via a no-op join attempt is unnecessary)

      // --- Question 1 ---
      const shownPromise = once<Record<string, unknown>>(alice, 'question:show');
      host.emit('host:startGame');
      const shown = await shownPromise;
      // SECURITY: the public question must never leak the correct answer.
      expect(shown).not.toHaveProperty('correctIndex');
      expect((shown.options as string[]).length).toBe(4);

      const revealPromise = once<any>(host, 'question:results');
      const aliceResultPromise = once<any>(alice, 'answer:result');
      alice.emit('player:answer', { optionIndex: 0 }); // correct
      bob.emit('player:answer', { optionIndex: 1 }); // wrong
      const reveal = await revealPromise;
      const aliceResult = await aliceResultPromise;

      expect(reveal.correctIndex).toBe(0);
      expect(reveal.distribution).toEqual([1, 1, 0, 0]);
      expect(reveal.leaderboard[0].nickname).toBe('Alice');
      expect(aliceResult.correct).toBe(true);
      expect(aliceResult.pointsEarned).toBeGreaterThan(0);

      // --- Question 2 ---
      const shown2Promise = once<Record<string, unknown>>(bob, 'question:show');
      host.emit('host:nextQuestion');
      await shown2Promise;

      const reveal2Promise = once<any>(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 0 }); // wrong
      bob.emit('player:answer', { optionIndex: 1 }); // correct
      const reveal2 = await reveal2Promise;
      expect(reveal2.correctIndex).toBe(1);

      // --- End ---
      const overPromise = once<any>(host, 'game:over');
      host.emit('host:nextQuestion'); // past the last question -> game over
      const over = await overPromise;
      expect(over.leaderboard).toHaveLength(2);
      const total = over.leaderboard.reduce((s: number, e: any) => s + e.score, 0);
      expect(total).toBeGreaterThan(0);

      void lobbyPromise;
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('rejects a duplicate nickname and a bad PIN', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const a = connect(url);
    const b = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;

      const first = await a.emitWithAck('player:join', { pin, nickname: 'Sam' });
      expect(first.ok).toBe(true);

      const dup = await b.emitWithAck('player:join', { pin, nickname: 'sam' });
      expect(dup.ok).toBe(false);

      const badPin = await b.emitWithAck('player:join', { pin: '000000', nickname: 'Sam' });
      expect(badPin.ok).toBe(false);
    } finally {
      host.close();
      a.close();
      b.close();
      teardown();
    }
  }, 15000);

  it('lets a dropped player rejoin and keep their score', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;
      const aJoin = await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });
      const aliceId = aJoin.playerId as string;

      // Q1: Alice correct, Bob wrong -> reveal.
      const shown = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown;
      const revealP = once<any>(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 0 });
      bob.emit('player:answer', { optionIndex: 1 });
      const reveal = await revealP;
      const aliceScore = reveal.leaderboard.find(
        (e: any) => e.nickname === 'Alice',
      ).score;
      expect(aliceScore).toBeGreaterThan(0);

      // Alice's phone drops.
      alice.close();

      // A fresh socket rejoins with her playerId and is resynced.
      const alice2 = connect(url);
      const syncP = once<any>(alice2, 'state:sync');
      const rejoin = await alice2.emitWithAck('player:rejoin', {
        pin,
        playerId: aliceId,
      });
      expect(rejoin.ok).toBe(true);
      expect(rejoin.nickname).toBe('Alice');
      const snap = await syncP;
      expect(snap.phase).toBe('reveal');
      expect(snap.myResult.totalScore).toBe(aliceScore);

      // Q2 then end — no duplicate Alice, score carried forward.
      const shown2 = once(bob, 'question:show');
      host.emit('host:nextQuestion');
      await shown2;
      const reveal2P = once<any>(host, 'question:results');
      alice2.emit('player:answer', { optionIndex: 1 }); // correct on Q2
      bob.emit('player:answer', { optionIndex: 0 });
      await reveal2P;

      const overP = once<any>(host, 'game:over');
      host.emit('host:nextQuestion');
      const over = await overP;
      const aliceRows = over.leaderboard.filter((e: any) => e.nickname === 'Alice');
      expect(aliceRows).toHaveLength(1);
      expect(aliceRows[0].score).toBeGreaterThan(aliceScore);

      alice2.close();
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('survives a host reload and lets the host reclaim control', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;
      const hostToken = created.hostToken as string;
      expect(hostToken).toBeTruthy();

      await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });

      const shown = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown;
      const revealP = once<any>(host, 'question:results');
      alice.emit('player:answer', { optionIndex: 0 }); // correct
      bob.emit('player:answer', { optionIndex: 1 }); // wrong
      await revealP;

      // The host's laptop "reloads": the socket drops. The game must NOT end.
      host.close();

      // A fresh host socket reclaims the game with the stored token.
      const host2 = connect(url);
      const syncP = once<any>(host2, 'host:sync');
      const rejoin = await host2.emitWithAck('host:rejoin', { pin, hostToken });
      expect(rejoin.ok).toBe(true);
      const sync = await syncP;
      expect(sync.phase).toBe('reveal');
      expect(sync.reveal.leaderboard[0].nickname).toBe('Alice');

      // Control is restored: the reclaimed host can advance the game.
      const shown2 = once(bob, 'question:show');
      host2.emit('host:nextQuestion');
      await shown2;
      host2.close();
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);

  it('tracks answer streaks and reports rank movement', async () => {
    const { url, teardown } = await setup();
    const host = connect(url);
    const alice = connect(url);
    const bob = connect(url);
    try {
      const created = await host.emitWithAck('host:createGame', { quiz: QUIZ });
      const pin = created.pin as string;
      await alice.emitWithAck('player:join', { pin, nickname: 'Alice' });
      await bob.emitWithAck('player:join', { pin, nickname: 'Bob' });

      // Q1: Alice correct -> streak 1, no bonus yet, no prior rank (delta null).
      const shown1 = once(alice, 'question:show');
      host.emit('host:startGame');
      await shown1;
      const a1P = once<any>(alice, 'answer:result');
      alice.emit('player:answer', { optionIndex: 0 }); // correct
      bob.emit('player:answer', { optionIndex: 1 }); // wrong
      const a1 = await a1P;
      expect(a1.streak).toBe(1);
      expect(a1.streakBonus).toBe(0);
      expect(a1.rankDelta).toBeNull();

      // Q2: Alice correct again -> streak 2 earns a bonus.
      const shown2 = once(alice, 'question:show');
      host.emit('host:nextQuestion');
      await shown2;
      const a2P = once<any>(alice, 'answer:result');
      alice.emit('player:answer', { optionIndex: 1 }); // Q2 correct index is 1
      bob.emit('player:answer', { optionIndex: 0 }); // wrong
      const a2 = await a2P;
      expect(a2.streak).toBe(2);
      expect(a2.streakBonus).toBeGreaterThan(0);
      // Rank delta is present (a number) now that there is a prior standing.
      expect(typeof a2.rankDelta).toBe('number');
    } finally {
      host.close();
      alice.close();
      bob.close();
      teardown();
    }
  }, 15000);
});
