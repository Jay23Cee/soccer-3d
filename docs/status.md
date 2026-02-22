# Soccer 3D Project Status

Last updated: 2026-02-22

## Project Status Chart

| Status | Item | Evidence (files/folders) | Notes |
|---|---|---|---|
| Done | Single-page app boot and render pipeline | `index.html`, `src/main.jsx`, `src/App.jsx` | Browser loads one React entrypoint and mounts full app runtime. |
| Done | Match state machine and HUD overlay | `src/App.jsx`, `src/ui/MatchStoryPanel.jsx`, `src/config/gameConfig.js` | Includes `idle/intro/in_play/goal_scored/paused/ended`, scoreboard, timer, and timeline. |
| Done | Ball possession, pass, and shot mechanics | `src/SoccerBallModel.jsx`, `src/App.jsx`, `src/config/gameConfig.js` | Implements charge shot, possession detection, pass commands, and out-of-bounds handling. |
| Done | Goal detection and scoring loop | `src/GoalNet.jsx`, `src/App.jsx` | Goal trigger debounce and score updates are wired end-to-end. |
| Done | AI opponent and goalkeeper behaviors | `src/ai/opponentController.js`, `src/ai/goalkeeperController.js`, `src/App.jsx` | Interval-based AI updates and keeper save/distribute actions are active. |
| Done | Replay and cinematic camera direction | `src/replay/ReplayDirector.js`, `src/camera/CameraDirector.jsx`, `src/App.jsx` | Replay buffer/playback and camera mode transitions are integrated. |
| Done | Automated tests and lint baseline | `src/App.test.jsx`, `src/SoccerBallModel.test.jsx`, `src/SoccerPlayer.test.jsx`, `src/ai/*.test.js`, `src/replay/*.test.js`, `package.json` | `npm run test:ci` passed (29 tests), `npm run lint` passed. |
| In Progress | Architectural modularization is partial | `src/App.jsx`, `src/ai/`, `src/camera/`, `src/replay/` | AI/camera/replay are extracted, but `src/App.jsx` still centralizes broad orchestration. |
| In Progress | Build artifact strategy is mixed | `package.json`, `dist/`, `build/` | Scripts target Vite `dist/`, while `build/` is also present in repo and needs canonicalization. |
| In Progress | Telemetry/event system exists only in-memory | `src/App.jsx`, `src/ui/MatchStoryPanel.jsx` | `emitTelemetryEvent` feeds UI timeline; no external sink/export path is implemented. |
| Next | Split `App.jsx` into feature modules (state, input, UI orchestration) | `src/App.jsx`, `src/ui/`, `src/replay/`, `src/ai/`, `src/camera/` | Highest maintainability leverage and safer future iteration. |
| Next | Standardize `dist/` vs `build/` output and document one deployment artifact | `package.json`, `dist/`, `build/`, `README.md` | Reduces deployment ambiguity and release risk. |
| Next | Add architecture-driven runtime telemetry hooks for match/replay diagnostics | `src/App.jsx`, `src/replay/ReplayDirector.js`, `src/config/gameConfig.js` | Build on existing event timeline foundation with structured event outputs. |
| Later | Formalize deployment target and add minimal config/runbook | `README.md`, `docs/architecture.md`, `package.json` | No deployment config file exists yet (`Dockerfile`, `vercel.json`, etc. not found). |
| Later | Introduce env/config boundary for tunables | `src/config/gameConfig.js`, `README.md`, `vite.config.js` | Move runtime tunables behind explicit config inputs rather than only hardcoded constants. |

## Evidence references

### Core docs and config reviewed
- `README.md`
- `package.json`
- `vite.config.js`
- `index.html`

### Runtime entrypoints and core flow sources reviewed
- `src/main.jsx`
- `src/App.jsx`
- `src/SoccerBallModel.jsx`
- `src/GoalNet.jsx`
- `src/SoccerField.jsx`
- `src/SoccerPlayer.jsx`
- `src/ai/opponentController.js`
- `src/ai/goalkeeperController.js`
- `src/camera/CameraDirector.jsx`
- `src/replay/ReplayDirector.js`
- `src/config/gameConfig.js`
- `src/ui/MatchStoryPanel.jsx`

### Validation evidence
- Test suite: `npm run test:ci` passed (29 tests across 6 files).
- Lint: `npm run lint` passed.

### Required path audit (explicit missing items)
- `next.config.*`: Not found in repo
- `tsconfig.*`: Not found in repo
- `prisma/schema.prisma`: Not found in repo
- `app/`, `pages/`, `pages/api/`: Not found in repo
- backend/services folders: Not found in repo
- deployment config (`Dockerfile`, `docker-compose`, `vercel.json`, `netlify.toml`): Not found in repo
- environment variable usage (`process.env`, `import.meta.env`, `VITE_*`): Not found in repo

## Decision Log

### Assumptions made
- The canonical runtime stack is Vite + React + React Three Fiber + Cannon based on `package.json` and `vite.config.js`.
- Current project scope is frontend-only simulation with no server/API/auth/database layer in this repository.
- Status classification is strict evidence only: no speculative `In Progress` items were included.
- Roadmap ordering prioritizes foundational engineering and delivery clarity before new gameplay expansion.

### Missing info not found in repo
- Formal deployment target/environment (host platform, region, CDN strategy).
- Production observability/telemetry sink design.
- Database and backend contract (if planned).
- Authentication requirements/user model (if planned).
- Release/versioning policy and CI/CD workflow definition.

### Next 5 highest-leverage tasks (ordered)
1. Break `src/App.jsx` into feature modules (state machine, UI, input, orchestration).  
   Evidence anchor: `src/App.jsx` currently centralizes broad game control logic.
2. Standardize build output strategy (`dist/` vs `build/`) and document one canonical artifact.  
   Evidence anchor: scripts in `package.json` target `dist/`, while `build/` also exists.
3. Add architecture-driven runtime telemetry hooks for match events/replay diagnostics.  
   Evidence anchor: `emitTelemetryEvent` and timeline flow in `src/App.jsx` currently remain in-memory.
4. Formalize deployment target and add corresponding minimal config/runbook.  
   Evidence anchor: deployment config files are not present.
5. Introduce env/config boundary for tunables currently hardcoded in `src/config/gameConfig.js`.  
   Evidence anchor: gameplay constants are currently defined directly in code.
