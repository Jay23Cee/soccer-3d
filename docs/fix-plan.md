# Fix Plan

## Severity-Grouped Checklist

### High
- [ ] Fix goal-target/score ownership consistency for AI opponents.
  - Files: `src/ai/opponentController.js`, `src/App.jsx`, related tests in `src/ai/opponentController.test.js` and `src/App.test.jsx`.
  - Definition of done: Team Two-controlled shots can only credit Team Two when they score.

- [ ] Isolate replay from live gameplay side effects.
  - Files: `src/SoccerBallModel.jsx`.
  - Definition of done: During replay, out-of-bounds reset and power-zone capture callbacks are suppressed.

- [ ] Reduce dev dependency security risk in lint stack.
  - Files: `package.json`, `package-lock.json`.
  - Definition of done: `npm audit --audit-level=high` is reduced or justified with pinned risk acceptance.

### Medium
- [ ] Handle shot event types explicitly (`shot`, `save`, `ball_pop`, etc.).
  - Files: `src/App.jsx`, `src/SoccerBallModel.jsx`, `src/App.test.jsx`.

- [ ] Deep-clone replay frame nested vectors.
  - Files: `src/replay/ReplayDirector.js`, `src/replay/ReplayDirector.test.js`.

- [ ] Reduce camera-state render churn.
  - Files: `src/camera/CameraDirector.jsx`, `src/App.jsx`.

- [ ] Memoize/stabilize geometry allocations.
  - Files: `src/SoccerField.jsx`.

- [ ] Add typecheck baseline for JS codebase.
  - Files: `package.json`, new `tsconfig.json`.

### Low
- [ ] Map opponent `TRACK` mode to `"track"` animation state.
  - Files: `src/App.jsx`.

- [ ] Remove dead `Array.isArray(teamOneRoster)` branch.
  - Files: `src/SoccerBallModel.jsx`.

## Dependencies / Order of Operations
1. Replay isolation fix first.
- Prevents future debugging noise from replay mutating live state.

2. AI goal-direction/score-ownership fix second.
- Core gameplay correctness; update tests immediately after.

3. Shot-event type normalization third.
- Depends on clear event semantics from step 2.

4. Replay clone hardening fourth.
- Safe to apply once replay behavior baseline is stable.

5. Performance fixes fifth.
- Camera churn and geometry memoization should be profiled against corrected gameplay behavior.

6. Tooling/typecheck/security hardening last in sprint.
- Lower risk to gameplay, but important for future regression containment.

## Quick Wins (<30 Minutes)
- [ ] Add replay guard around out-of-bounds and power-zone callbacks in `src/SoccerBallModel.jsx`.
- [ ] Change `handleShotEvent` to ignore `ball_pop` for shot stats in `src/App.jsx`.
- [ ] Add explicit `OPPONENT_STATES.TRACK -> "track"` mapping in `src/App.jsx`.
- [ ] Remove redundant array-type check in `src/SoccerBallModel.jsx`.

## Validation Sequence Per PR
1. `npm run lint`
2. `npm test -- --run`
3. `npm run build`
4. `npm audit --omit=dev`
5. `npm audit --audit-level=high` (for dependency-change PRs)