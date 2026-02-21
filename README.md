# Soccer 3D

Soccer 3D is a browser-based 3D soccer prototype built with React, React Three Fiber, and Cannon physics.

## What It Does

- Renders a textured soccer field with goal models and physics colliders.
- Spawns a controllable soccer ball (arrow keys + space).
- Tracks Brazil vs Argentina scoring from goal triggers.
- Runs a timed match loop with states: idle, in play, goal scored, paused, ended.
- Supports ball reset, match restart, and out-of-bounds recovery.

## Controls

- `Arrow Up/Down/Left/Right`: Move the ball
- `Space`: Pop the ball upward
- Overlay buttons:
  - `Start Match`
  - `Pause/Resume`
  - `Reset Ball`
  - `Restart Match`

## Tech Stack

- `react`
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/cannon`
- `three`
- `vite`
- `vitest`

## Project Structure

- `src/App.jsx`: Main game loop, state machine, score/timer UI.
- `src/SoccerBallModel.jsx`: Ball physics, controls, velocity capping, out-of-bounds handling.
- `src/GoalNet.jsx`: Goal model + frame colliders + ball-only trigger scoring.
- `src/SoccerField.jsx`: Field mesh, markings, and arena boundary colliders.
- `src/main.jsx`: Vite entry point for React rendering.
- `src/config/gameConfig.js`: Gameplay and physics constants.
- `docs/ASSETS.md`: Asset usage and attribution details.

## Scripts

- `npm start`: Run development server (alias of `npm run dev`).
- `npm run dev`: Run development server.
- `npm run build`: Create production build.
- `npm run preview`: Preview production build locally.
- `npm test`: Run tests in watch mode with Vitest.
- `npm run test:ci`: Run tests once for CI.
- `npm run lint`: Run ESLint on `src`.

## Notes

- Runtime public assets were reduced to only files used by the app.
- Non-runtime archives/executables were removed from deploy payload.
- Tests mock R3F/Cannon components so they run in jsdom reliably.

## Asset Attribution

See `docs/ASSETS.md`.
