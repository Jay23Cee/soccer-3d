# Code Review Report

## Executive Summary
- This repository is a Vite + React + React Three Fiber game, not a Next.js app; there are no `app/`, `pages/`, API routes, Prisma, auth, or middleware layers.
- Core automated checks pass (`lint`, `test`, `build`) after a fallback install, but the required clean install step (`npm ci`) failed due a Windows file-lock (`esbuild.exe`), so reproducibility is currently brittle.
- I found 3 confirmed correctness bugs, including one high-impact gameplay rules bug (AI attacking/scoring direction mismatch) and one replay-state isolation bug.
- Security risk is currently concentrated in dev tooling dependencies (`npm audit` reports 21 high severity issues in the ESLint dependency chain; runtime/prod audit is clean).
- Maintainability risk is rising due a very large `src/App.jsx` control surface and missing typecheck infrastructure.

## Repo Scan
- Top-level folders: `build/`, `dist/`, `docs/`, `node_modules/`, `public/`, `src/`.
- Entrypoint: `src/main.jsx`.
- Main gameplay loop: `src/App.jsx`.
- No Next.js entrypoints (`app/` or `pages/`), no API routes, no `prisma/`, no `middleware`, no auth module.
- Config-centric gameplay constants: `src/config/gameConfig.js`.

## Commands Run (and Output Summary)
1. `npm ci`
- Result: failed.
- Error summary: `EPERM: operation not permitted, unlink ... node_modules/@esbuild/win32-x64/esbuild.exe`.

2. `npm run typecheck`
- Result: failed.
- Error summary: missing script (`Missing script: "typecheck"`).

3. `npx tsc -p . --noEmit`
- Result: failed.
- Error summary: no `tsconfig.json` found.

4. `npm run lint`
- Result: passed.

5. `npm test -- --run`
- Result: passed.
- Summary: 6 test files, 29 tests, all passed.

6. `npm run build`
- Result: passed with warning.
- Summary: bundle built; JS chunk ~1,987.54 kB (gzip ~551.36 kB), Rollup chunk-size warning.

7. `npm audit --omit=dev`
- Result: passed.
- Summary: 0 production vulnerabilities.

8. `npm audit --audit-level=high`
- Result: failed.
- Summary: 21 high severity vulnerabilities (dev dependency chain, primarily `minimatch` through ESLint tooling).

## Findings Table
| Severity | Area | Finding | File/Path |
|---|---|---|---|
| High | Correctness | Opponent AI targets a goal that maps score to the opposite team | `src/ai/opponentController.js:63`, `src/App.jsx:1095`, `src/App.jsx:2347`, `src/App.jsx:2355` |
| High | Correctness/Reliability | Replay playback can still trigger live out-of-bounds and power-zone side effects | `src/SoccerBallModel.jsx:481`, `src/SoccerBallModel.jsx:505`, `src/SoccerBallModel.jsx:533` |
| Medium | Correctness | `ball_pop` events are counted as shots/on-target and change momentum | `src/SoccerBallModel.jsx:381`, `src/App.jsx:1292` |
| High | Security | 21 high vulnerabilities in dev toolchain dependency graph | `package.json:45`, `package.json:46` |
| Medium | Reliability | Replay frame cloning is shallow for nested arrays and can corrupt replay data if sources are mutated | `src/replay/ReplayDirector.js:6`, `src/replay/ReplayDirector.js:7`, `src/replay/ReplayDirector.js:8` |
| Medium | Performance | Camera state is pushed into React state every ~100ms from render loop, forcing frequent global rerenders | `src/camera/CameraDirector.jsx:163`, `src/App.jsx:2215` |
| Medium | Performance | New `THREE.PlaneGeometry` instances are allocated inline during render | `src/SoccerField.jsx:129`, `src/SoccerField.jsx:143`, `src/SoccerField.jsx:166`, `src/SoccerField.jsx:171` |
| Medium | Maintainability | Single large orchestration file increases regression risk and review cost | `src/App.jsx` |
| Medium | Maintainability | No typecheck pipeline exists (`typecheck` script + tsconfig absent) | `package.json:16`, `package.json:24` |
| Low | Logic/UI consistency | Opponent `TRACK` mode maps to `"idle"` animation state | `src/App.jsx:616`, `src/App.jsx:623`, `src/App.jsx:2263` |
| Low | Maintainability | Redundant defensive check on `teamOneRoster` is dead logic | `src/SoccerBallModel.jsx:625`, `src/SoccerBallModel.jsx:732` |

## Detailed Findings

### 1) High (Confirmed Bug): Opponent AI goal targeting and score mapping conflict
- What it is: Opponent AI hard-codes `targetGoal` to negative Z (`-FIELD_CONFIG.LENGTH / 2 + 2`), while scoring maps goal trigger `goalId="teamOne"` to Team One points.
- Why it matters: A successful AI shot into its computed target can credit the wrong team, breaking core match correctness.
- Evidence:
  - AI target: `src/ai/opponentController.js:63`
  - Goal -> team scoring map: `src/App.jsx:1095`
  - Goal locations: `src/App.jsx:2347`, `src/App.jsx:2355`
- Reproduce:
  - Run a match until AI enters shoot mode near negative-Z goal.
  - Observe AI shot direction is toward negative-Z goal while score ownership is bound to `goalId` mapping.
- Exact fix strategy:
  - Introduce explicit attack-direction/target-goal by team in AI input (`attackingTeamId` or `targetGoal` from caller).
  - Compute AI shot target from team identity instead of hard-coded negative-Z.
  - Add/adjust unit tests to verify each team targets the goal that credits that same team.
- Tradeoff: Requires touching both AI controller interface and calling site; minimal scope if done as explicit `targetGoal` input.

### 2) High (Confirmed Bug): Replay can mutate live game state through collision side effects
- What it is: During replay, ball transform is force-set each frame, but collision subscribers still process out-of-bounds and power-zone entry logic.
- Why it matters: Replay (read-only visual state) can trigger real gameplay effects (ball reset, boosts), violating state isolation.
- Evidence:
  - Side effects in position subscriber: `src/SoccerBallModel.jsx:481`, `src/SoccerBallModel.jsx:505`
  - Replay write path: `src/SoccerBallModel.jsx:533`
- Reproduce:
  - Start replay while a power zone is active and replay trajectory intersects the zone.
  - Observe boost activation or out-of-bounds reset during replay.
- Exact fix strategy:
  - Add replay guard before side-effect handlers in position subscription (`if (replayActive) return;`).
  - Include `replayActive` in the effect dependency list.
- Tradeoff: None meaningful; this is a safe isolation fix.

### 3) Medium (Confirmed Bug): `ball_pop` is treated as a full shot event
- What it is: Ball-control pop (`type: "ball_pop"`) is emitted, but the event handler treats any non-save event as `shot` and increments `shots` + `onTarget` + momentum.
- Why it matters: Match stats and momentum are inflated by non-shot interactions.
- Evidence:
  - Emitter: `src/SoccerBallModel.jsx:381`
  - Handler coercion: `src/App.jsx:1292`
- Reproduce:
  - Switch to Ball control, press `D` in play.
  - Observe shot/on-target stats increase.
- Exact fix strategy:
  - Replace binary mapping with explicit event-type handling (`shot`, `save`, `ball_pop`, etc.).
  - Ignore `ball_pop` for shot stats, or track separately.
- Tradeoff: Small behavior change; tests should be updated accordingly.

### 4) High (High-Risk Likely): Dev dependency security debt
- What it is: `npm audit --audit-level=high` reports 21 high vulnerabilities in ESLint/minimatch-related dev dependency chain.
- Why it matters: CI/dev environments remain exposed to known vulnerable transitive packages; this is a supply-chain risk.
- Evidence:
  - Audit output ties to ESLint stack rooted in `package.json:45` and `package.json:46`.
- Reproduce:
  - Run `npm audit --audit-level=high`.
- Exact fix strategy:
  - Upgrade lint stack to currently supported majors (`eslint`, `eslint-config-react-app` replacement path, or flat config migration).
  - Prefer non-`--force` targeted upgrades first, then re-run audit.
- Tradeoff: Potential lint-rule and config migration effort.

### 5) Medium (High-Risk Likely): Shallow replay frame cloning
- What it is: Replay frame clone spreads objects but does not deep-clone nested arrays (`position`, `velocity`).
- Why it matters: If upstream payloads become mutable references, replay history can be mutated unexpectedly.
- Evidence: `src/replay/ReplayDirector.js:6`, `src/replay/ReplayDirector.js:7`, `src/replay/ReplayDirector.js:8`
- Reproduce:
  - Push frame objects with reused array references, mutate source arrays, observe replay frame drift.
- Exact fix strategy:
  - Deep-clone nested vector arrays (`position`, `velocity`, `rotation`) in `cloneFrame`.
- Tradeoff: Slight allocation overhead; correctness gain outweighs cost.

### 6) Medium (High-Risk Likely): Frequent top-level rerenders from camera telemetry
- What it is: Camera loop emits state every ~100ms and writes to React state at app root.
- Why it matters: This can drive unnecessary rerenders and frame-time spikes in a heavy scene.
- Evidence: `src/camera/CameraDirector.jsx:163`, `src/App.jsx:2215`
- Reproduce:
  - Profile React commits while game runs; observe periodic app-level updates even without meaningful UI change.
- Exact fix strategy:
  - Store high-frequency camera telemetry in refs.
  - Only commit React state when coarse-grained fields actually change (e.g., mode transitions).
- Tradeoff: Slightly more complex data flow; significantly reduced render pressure.

### 7) Medium (Code Smell): Geometry allocations in render path
- What it is: `new THREE.PlaneGeometry(...)` is created inline multiple times in JSX render.
- Why it matters: Repeated allocation/disposal churn can degrade performance and GPU memory stability.
- Evidence: `src/SoccerField.jsx:129`, `src/SoccerField.jsx:143`, `src/SoccerField.jsx:166`, `src/SoccerField.jsx:171`
- Reproduce:
  - Profile memory allocations while toggling state causing rerenders.
- Exact fix strategy:
  - Memoize/static-cache geometry instances with `useMemo` and reuse.
- Tradeoff: Slightly more setup code.

### 8) Medium (Code Smell): Large orchestration surface in `App.jsx`
- What it is: `src/App.jsx` combines UI, physics orchestration, AI loops, replay, telemetry, and timers in one file.
- Why it matters: Regression risk and review complexity are high; local fixes can create cross-system side effects.
- Evidence: `src/App.jsx` (2k+ lines).
- Reproduce:
  - Change any control/timer behavior and observe broad blast radius.
- Exact fix strategy:
  - Extract domain hooks/modules (`useMatchClock`, `useReplay`, `useOpponentAI`, `usePowerPlay`, `usePlayerInput`).
- Tradeoff: Refactor effort, but no runtime behavior change required if done incrementally.

### 9) Medium (Code Smell): Missing typecheck safety net
- What it is: No `typecheck` script and no `tsconfig.json` means no static type-level validation.
- Why it matters: Complex object-shape contracts across controllers/components are currently runtime-only.
- Evidence: `package.json:16`, `package.json:24` and failed `npx tsc -p . --noEmit`.
- Reproduce:
  - Run `npm run typecheck`.
- Exact fix strategy:
  - Add `tsconfig.json` with `allowJs` + `checkJs` for incremental adoption.
  - Add `"typecheck": "tsc --noEmit"` script.
- Tradeoff: Initial annotation noise; strong long-term safety gain.

### 10) Low (Code Smell): Opponent animation state mapping omits TRACK mode
- What it is: `getOpponentAnimationState` does not map `OPPONENT_STATES.TRACK` to `"track"`.
- Why it matters: Mode-to-animation contract is inconsistent and harder to reason about.
- Evidence: `src/App.jsx:616`, `src/App.jsx:623`, `src/App.jsx:2263`
- Reproduce:
  - Observe opponent in track mode uses fallback animation state.
- Exact fix strategy:
  - Add explicit TRACK mapping in `getOpponentAnimationState`.
- Tradeoff: None.

### 11) Low (Code Smell): Dead defensive check
- What it is: `teamOneRoster` is always an array, but code still checks `Array.isArray(teamOneRoster)` later.
- Why it matters: Redundant branches add cognitive load and hide real edge handling.
- Evidence: `src/SoccerBallModel.jsx:625`, `src/SoccerBallModel.jsx:732`
- Reproduce:
  - Static inspection.
- Exact fix strategy:
  - Remove impossible condition, keep only `teamOneRoster.length === 0` guard.
- Tradeoff: None.

## Suggested Refactors (Optional)
- Extract replay integration into `src/replay/useReplayEngine.js` (state sync + frame capture + skip handling).
- Extract player input and stamina loop into `src/player/usePlayerController.js`.
- Replace ad-hoc telemetry event construction with a typed event factory module.

## Testing Plan to Validate Fixes
1. Add regression tests for scoring direction.
- Assert Team Two AI shot vectors and resulting goals increment Team Two score.

2. Add replay isolation tests.
- During replay, assert `onOutOfBounds` and `onPowerZoneEnter` are not called.

3. Add event typing tests.
- Assert `ball_pop` does not increment `shots`/`onTarget`.

4. Add performance guard checks.
- Use React Profiler baseline before/after camera state emission throttling/ref migration.

5. Re-run full CI sequence.
- `npm run lint`
- `npm test -- --run`
- `npm run build`
- `npm audit --omit=dev`
- `npm audit --audit-level=high`