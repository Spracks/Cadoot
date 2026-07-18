# Contributing to Cadoot

Thanks for helping improve Cadoot! It's a small, self-contained project meant to
be easy for other instructors to run and hack on. This guide gets you set up and
lists what to check before you push.

## Prerequisites

- **Node.js 20+** and npm (comes with Node).
- That's it — no database, no external services.

## Getting started

```bash
git clone <repo-url>
cd Kaboop
npm install          # installs all three workspaces
npm run dev          # server on :3000, client with hot reload on :5173
```

Open <http://localhost:5173> for development. For a production-style run
(single port, serves the built client), use `npm run build && npm start`.

## Project layout

```
shared/    Types, quiz schema (zod), scoring, JSON/CSV parsing — the client<->server contract
server/    Express + Socket.IO game server (in-memory games)
client/    React + Vite web app (host + player screens)
quizzes/   Example quiz files + format docs
```

The client↔server protocol is a **typed contract** in `shared/src/events.ts`. If
you add or change a socket message, update the types there first — the compiler
will then point you at every place that needs to change on both sides.

## Before you push

Run the same checks CI runs (see `.github/workflows/ci.yml`); all must pass:

```bash
npm run typecheck    # type-check every workspace
npm test             # unit + integration tests (Vitest)
npm run build        # production client build
```

## Guidelines

- **Match the existing style.** Keep changes typechecking under the strict
  settings in `tsconfig.base.json`; follow the naming and structure of nearby code.
- **Put logic in `shared/` and test it.** Pure logic (scoring, parsing, quiz
  building) lives in `shared/` (or `client/src/quizDraft.ts`) with Vitest tests
  next to it. Add or update tests when you change behavior.
- **Keep the security properties intact.** Players must never receive the correct
  answer before the reveal, and answer timing is computed server-side. Don't add
  the answer to the `question:show` payload.
- **Keep it dependency-light.** This is meant to be trivial to run on a laptop;
  prefer standard-library / small solutions over heavy dependencies.
- **Games stay ephemeral.** No databases or on-disk game state — everything lives
  in server memory by design.

## Adding quiz questions or formats

Quiz parsing/validation lives in `shared/src/parse.ts` and the schema in
`shared/src/quiz.ts`. Example files and the authoring docs are in `quizzes/`.
Validate any quiz file with `npm run validate-quiz -- path/to/quiz.json`.

## Pull requests

Open a PR against `main`. CI will run typecheck, tests, and the build; a green
check means it's safe to merge. Keep PRs focused and describe what changed and why.

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
