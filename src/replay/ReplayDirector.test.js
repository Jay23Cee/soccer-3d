import { describe, expect, test } from "vitest";
import { createReplayDirector } from "./ReplayDirector";

function pushFrames(director, startMs, count) {
  for (let index = 0; index < count; index += 1) {
    director.pushFrame({
      timestampMs: startMs + index * 34,
      ball: {
        position: [index * 0.1, 1, -index * 0.2],
        velocity: [0, 0, -3],
      },
      players: [],
      keepers: [],
      cameraTarget: [0, 0, 0],
    });
  }
}

describe("ReplayDirector", () => {
  test("arms and enters playing once enough post-event frames exist", () => {
    const director = createReplayDirector({
      PRE_EVENT_FRAMES: 10,
      POST_EVENT_FRAMES: 6,
      MAX_BUFFER_FRAMES: 64,
      FRAME_INTERVAL_MS: 34,
      COOLDOWN_MS: 200,
    });

    pushFrames(director, 0, 20);
    const armed = director.armReplay({ type: "goal", id: "evt-1" }, 680);
    expect(armed).toBe(true);

    pushFrames(director, 700, 12);
    let replayState = director.update(1100);
    expect(replayState.mode).toBe("playing");
    expect(replayState.isPlaying).toBe(true);
    expect(director.getCurrentFrame()).toBeTruthy();

    replayState = director.update(2400);
    expect(["playing", "cooldown"]).toContain(replayState.mode);
  });

  test("skip transitions playback to cooldown and then idle", () => {
    const director = createReplayDirector({
      PRE_EVENT_FRAMES: 6,
      POST_EVENT_FRAMES: 4,
      MAX_BUFFER_FRAMES: 48,
      FRAME_INTERVAL_MS: 34,
      COOLDOWN_MS: 120,
    });

    pushFrames(director, 0, 16);
    director.armReplay({ type: "save", id: "evt-2" }, 550);
    pushFrames(director, 560, 12);
    director.update(920);
    expect(director.getPublicState().mode).toBe("playing");

    const skipped = director.skip(980);
    expect(skipped).toBe(true);
    expect(director.getPublicState().mode).toBe("cooldown");

    director.update(1200);
    expect(director.getPublicState().mode).toBe("idle");
  });

  test("clones nested vectors so source mutation does not alter replay frames", () => {
    const director = createReplayDirector({
      PRE_EVENT_FRAMES: 1,
      POST_EVENT_FRAMES: 1,
      MAX_BUFFER_FRAMES: 16,
      FRAME_INTERVAL_MS: 34,
      COOLDOWN_MS: 100,
    });

    const sharedBallPosition = [0, 1, 0];
    const sharedBallVelocity = [0, 0, -2];
    const sharedPlayerPosition = [1, 0, -1];

    director.pushFrame({
      timestampMs: 0,
      ball: {
        position: sharedBallPosition,
        velocity: sharedBallVelocity,
      },
      players: [{ playerId: "player_one", position: sharedPlayerPosition, rotation: [0, 0, 0] }],
      keepers: [],
      cameraTarget: [0, 0, 0],
    });

    director.armReplay({ type: "goal", id: "evt-clone" }, 34);
    director.pushFrame({
      timestampMs: 34,
      ball: {
        position: [0.2, 1, -0.5],
        velocity: [0, 0, -3],
      },
      players: [{ playerId: "player_one", position: [1.1, 0, -1.2], rotation: [0, 0.2, 0] }],
      keepers: [],
      cameraTarget: [0.1, 0, -0.1],
    });

    director.update(68);

    // Mutate original shared vectors after capture.
    sharedBallPosition[2] = 999;
    sharedBallVelocity[0] = 999;
    sharedPlayerPosition[0] = 999;

    const firstFrame = director.getCurrentFrame();
    expect(firstFrame.ball.position[2]).not.toBe(999);
    expect(firstFrame.ball.velocity[0]).not.toBe(999);
    expect(firstFrame.players[0].position[0]).not.toBe(999);
  });
});
