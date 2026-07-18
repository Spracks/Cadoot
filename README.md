# Cadoot 🎮

A self-hosted, **local-network** live quiz game for the classroom — a Kahoot-style
buzzer where students join with a PIN on their phones or laptops, race to answer
questions, and climb a live leaderboard. Runs entirely on your own machine or a
shared server. **Nothing is saved and nothing leaves your network.**

---

## Quick start

Requires **Node.js 20+**.

```bash
git clone <this-repo>
cd cadoot
npm install
npm run build      # builds the web client
npm start          # starts the server on port 3000
```

Then, on the **host** machine (the one plugged into the projector), open:

```
http://localhost:3000
```

Click **Host a game**, pick a quiz, and a 6-digit PIN + QR code appear. Students
join from their own devices at the **Network** URL printed in the terminal (e.g.
`http://192.168.1.225:3000`) or by scanning the QR code.

### Development

```bash
npm run dev        # server (:3000) + client with hot reload (:5173)
```

In dev, open the client at `http://localhost:5173`.

---

## How a game works

1. **Host** picks a quiz: the built-in sample, a `.json` / `.csv` file, or **type
   questions in manually** in the browser (with a *Download .json* button to save
   them for reuse).
2. Students open the join URL, enter the **PIN** and a **nickname**.
3. The host clicks **Start**. Each question shows on the shared screen with a timer.
4. Students tap a colored answer on their device. **Faster correct answers score more.**
5. After each question: the correct answer, the answer distribution, and the leaderboard.
6. At the end: a top-3 podium and final standings.

**Dropped connections are handled.** If a student's phone sleeps or briefly loses
Wi-Fi, their browser automatically rejoins the same game and keeps their score — no
re-entering the PIN. Disconnected players show dimmed on the host's lobby.

Games live only in the server's memory — closing the server or the host tab ends
the game. There is no database, no accounts, and no telemetry.

---

## ⚠️ Networking (read this before class)

Cadoot is designed to run on **an instructor's own laptop** on the classroom Wi-Fi.
The app is easy; getting students *connected* is the part that varies by network.

- **Same network.** The host laptop and all student devices must be on the same
  Wi-Fi. Students use the **Network URL** (an IP like `http://192.168.x.x:3000`),
  not `localhost` — or they just scan the QR code on the host screen.
- **Multiple network addresses.** Laptops often carry extra virtual adapters
  (university VPN, Docker, VirtualBox/WSL, phone tethering). Cadoot auto-detects
  and **ranks** the addresses, picks the most likely one for the QR code, and — if
  there's more than one candidate — shows a **dropdown on the host screen to switch**.
  If students can't connect, try the next address in that dropdown.
- **Client isolation / "AP isolation" — the most common blocker.** Many campus and
  guest Wi-Fi networks deliberately block device-to-device traffic. If students are
  on the Wi-Fi but still can't reach the host, this is almost always why. Options,
  easiest first:
  1. **Phone hotspot / travel router.** Host the laptop and students on a phone
     hotspot or a cheap travel router you control — isolation is off by default there.
     Fine for a class-sized group.
  2. **Ask IT** to disable client isolation for your classroom SSID, or to allow a
     specific host.
  3. **Retrofit to a shared machine.** Run Cadoot on a wired machine everyone can
     reach and pin its address with `PUBLIC_URL` (see below). Same app, no code changes.
- **Firewall.** On first run, allow Node.js through the laptop's firewall (Windows
  prompts — choose the network type matching the classroom, usually "Private").

> **Do a 2-minute dry run from your own phone on the actual classroom Wi-Fi before
> the first class.** Network surprises (especially AP isolation) are far easier to
> handle the day before than in front of students.

### Configuration

Set these as environment variables when starting the server:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on (`PORT=8080 npm start`) |
| `HOST` | `0.0.0.0` | Interface to bind |
| `PUBLIC_URL` | *(unset)* | Hard-pin the student join URL, e.g. `http://quiz.example.edu:3000`. Bypasses auto-detection — ideal for a fixed shared-machine deployment. |

---

## Writing quizzes

Start a game with the built-in sample, or load your own quiz file. Two formats are
supported (details and examples in [`quizzes/README.md`](quizzes/README.md)):

- **JSON** — `correctIndex` is 0-based.
- **CSV** — author in any spreadsheet; the `correct` column is 1-based.

Validate a file before class:

```bash
npm run validate-quiz -- quizzes/example.json
npm run validate-quiz -- quizzes/example.csv
```

---

## Project layout

```
cadoot/
  shared/    Types, quiz schema (zod), scoring, JSON/CSV parsing — the client<->server contract
  server/    Express + Socket.IO game server (in-memory games)
  client/    React + Vite web app (host screen + player screen)
  quizzes/   Example quiz files + format docs
```

The realtime protocol is a **typed contract** in `shared/`, so the compiler catches
any mismatch between what the server sends and what the client expects.

### Security notes

- The correct answer is **never sent to players' devices** until the reveal — the
  question payload sent to players omits it entirely.
- Answer timing is measured **on the server**, so clients can't spoof a faster time.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run server + client with hot reload (development) |
| `npm run build` | Build the production web client |
| `npm start` | Run the production server (serves the built client) |
| `npm test` | Run unit + integration tests (Vitest) |
| `npm run typecheck` | Type-check every workspace |
| `npm run validate-quiz -- <file>` | Validate a quiz file |

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and
guidelines. Every push and pull request runs typecheck, tests, and a build via
GitHub Actions (`.github/workflows/ci.yml`).

## License

MIT — free to use, modify, and share.
See [LICENSE](LICENSE).
