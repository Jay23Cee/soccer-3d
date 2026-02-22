# Soccer 3D

## What this project is
Soccer 3D is a single-page browser prototype for a 3D soccer match built with React, React Three Fiber, and Cannon physics. The current implementation runs fully on the client and simulates Brazil vs Argentina gameplay with player/ball control modes, AI opponents and goalkeepers, timed match states, power-play boosts, replay playback, and broadcast-style HUD telemetry.

## Architecture overview
- App boot: `index.html` -> `src/main.jsx` -> `src/App.jsx`
- Core simulation: `src/SoccerBallModel.jsx`, `src/SoccerField.jsx`, `src/GoalNet.jsx`, `src/SoccerPlayer.jsx`
- Match orchestration/state machine: `src/App.jsx`, `src/config/gameConfig.js`
- AI/replay/camera: `src/ai/opponentController.js`, `src/ai/goalkeeperController.js`, `src/replay/ReplayDirector.js`, `src/camera/CameraDirector.jsx`
- Static runtime assets: `public/ball/*`, `public/goalnet.gltf`, `public/Grass001_2K-JPG/*`
- Not found in repo: Next.js route structure (`app/`, `pages/`, `pages/api/`), backend/services folder, Prisma/DB layer, auth provider, deployment config files (`Dockerfile`, `docker-compose`, `vercel.json`, `netlify.toml`)

## How it works
Full architecture diagrams and end-to-end runtime flow are in [`docs/architecture.md`](docs/architecture.md).

## Local setup
```bash
npm install
npm run dev
```

Validation and production commands:
```bash
npm run test:ci
npm run lint
npm run typecheck
npm run build
npm run preview
npm run e2e -- --list
```

## Env vars
No environment variables are required.

| Variable | Required | Purpose | Evidence |
|---|---|---|---|
| None | No | No `process.env`, `import.meta.env`, or `VITE_*` usage found. | `src/`, `vite.config.js` |

## Database
- Database: Not found in repo
- Prisma schema (`prisma/schema.prisma`): Not found in repo
- Migrations: Not applicable
- Seed scripts: Not applicable

## Scripts
From `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `start` | `vite` | Run the development server (same runtime target as `dev`). |
| `dev` | `vite` | Run the development server. |
| `build` | `vite build` | Create a production build in `dist/`. |
| `preview` | `vite preview` | Serve the built `dist/` output locally. |
| `test` | `vitest` | Run tests in watch mode. |
| `test:ci` | `vitest run` | Run tests once for CI/non-watch usage. |
| `typecheck` | `tsc --noEmit` | Run baseline JS type checks (`allowJs` + `checkJs`) for non-blocking static validation. |
| `lint` | `eslint "src/**/*.{js,jsx}"` | Lint source files under `src/`. |
| `e2e` | `playwright test` | Run browser end-to-end specs from `e2e/`. |
| `e2e:headed` | `playwright test --headed` | Run end-to-end specs with visible browser for debugging. |

## Deployment
- Deployment config files (`Dockerfile`, `docker-compose`, `vercel.json`, `netlify.toml`) were not found in this repo.
- The active build pipeline in `package.json` targets Vite, so the canonical deployable artifact is `dist/` (`npm run build`).
- A `build/` directory also exists in the repository, but current scripts do not produce it.

## Status
- Detailed status chart: [`docs/status.md`](docs/status.md)

### Done
- Single-page app boot and 3D runtime loop are implemented.
- Match states, scoring, timers, controls, power-play, and replay systems are implemented.
- AI opponent and goalkeeper controllers are implemented.
- Automated tests and linting are configured and currently passing.

### In Progress
- Architectural modularization is partial: AI/camera/replay are separated, while `src/App.jsx` still centralizes major orchestration.
- Build artifact strategy is mixed (`dist/` is script-driven; `build/` also exists).
- Telemetry/events are implemented in-memory for HUD/timeline but not exported to a persistent sink.

### Next
- Split `src/App.jsx` into focused modules (state machine, input, HUD orchestration).
- Standardize and document one build artifact path for deployment.
- Add structured runtime telemetry hooks for replay and match events.

### Later
- Formalize deployment target and add minimal deployment config/runbook.
- Introduce an env/config boundary for tunable gameplay/runtime values.

## Roadmap
1. Break `src/App.jsx` into feature modules for maintainability.
2. Standardize `dist/` vs `build/` output strategy and document one canonical artifact.
3. Add architecture-driven runtime telemetry hooks for match events/replay diagnostics.
4. Formalize deployment target and add corresponding minimal config/runbook.
5. Introduce env/config boundary for tunables currently hardcoded in `src/config/gameConfig.js`.
