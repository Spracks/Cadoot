import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@cadoot/shared';
import { registerHandlers } from './handlers';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
// Optional hard override for the URL shown to students (e.g. a fixed server
// hostname). When set, LAN address auto-detection is bypassed. Handy for the
// "run it on a shared machine" retrofit.
const PUBLIC_URL = process.env.PUBLIC_URL?.trim() || null;

const clientDist = path.resolve(
  fileURLToPath(new URL('../../client/dist', import.meta.url)),
);

const app = express();
// CSP disabled: this is a LAN-only tool serving a self-contained bundle.
app.use(helmet({ contentSecurityPolicy: false }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Lets the host page display/encode the correct LAN URL for students to join,
// since the browser itself only knows it loaded from "localhost".
app.get('/api/info', (_req, res) => res.json(joinInfo()));

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: send index.html for any non-file route.
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(200).send(
      'Cadoot server is running, but the client has not been built yet.\n' +
        'Run "npm run build" (production) or use "npm run dev" for development.',
    );
  });
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});

registerHandlers(io);

httpServer.listen(PORT, HOST, () => printBanner());

interface JoinInfo {
  port: number;
  /** True when PUBLIC_URL pins the address (no auto-detection / no picker). */
  pinned: boolean;
  /** Candidate join URLs, best guess first. */
  urls: string[];
}

function joinInfo(): JoinInfo {
  if (PUBLIC_URL) return { port: PORT, pinned: true, urls: [PUBLIC_URL] };
  return { port: PORT, pinned: false, urls: rankedUrls(PORT) };
}

/** Detected LAN URLs, ranked so the most likely student-facing one is first. */
function rankedUrls(port: number): string[] {
  const candidates: { url: string; score: number }[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      candidates.push({
        url: `http://${addr.address}:${port}`,
        score: scoreAddress(addr.address),
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).map((c) => c.url);
}

/**
 * Heuristic ranking of an IPv4 address for "is this the one students reach?".
 * We can't reliably detect the adapter *type* cross-platform, so we score by
 * well-known ranges and demote addresses that look like virtual adapters.
 */
function scoreAddress(ip: string): number {
  const parts = ip.split('.');
  const a = Number(parts[0] ?? 0);
  const b = Number(parts[1] ?? 0);
  const d = Number(parts[3] ?? 0);

  if (a === 169 && b === 254) return -100; // link-local (no DHCP)
  if (a === 100 && b >= 64 && b <= 127) return -50; // CGNAT / Tailscale
  if (a === 172 && b >= 16 && b <= 31) return -40; // Docker / containers

  let score: number;
  if (a === 192 && b === 168) score = 30; // typical Wi-Fi / home / small LAN
  else if (a === 10) score = 20; // common campus / corporate LAN (also some VPNs)
  else score = 5;

  // Host-only VM adapters (VMware/VirtualBox) usually give the host the ".1"
  // gateway address — almost never what a student should connect to.
  if (d === 1) score -= 25;
  return score;
}

function printBanner(): void {
  const info = joinInfo();
  const line = '─'.repeat(56);
  console.log(`\n${line}`);
  console.log('  🎮  Cadoot server is live');
  console.log(line);
  console.log(`  Host the game here:  http://localhost:${PORT}`);
  if (info.pinned) {
    console.log(`  Students join at:    ${info.urls[0]}   (PUBLIC_URL)`);
  } else if (info.urls.length > 0) {
    console.log(`  Students join at:    ${info.urls[0]}   <- best guess`);
    if (info.urls.length > 1) {
      console.log('  Other addresses (pick the one matching your Wi-Fi):');
      for (const url of info.urls.slice(1)) console.log(`       ${url}`);
    }
  } else {
    console.log('  Students join at:    (no network address detected)');
  }
  console.log(line);
  console.log('  The host screen shows a QR code and lets you switch');
  console.log('  address if students can’t connect.\n');
}
