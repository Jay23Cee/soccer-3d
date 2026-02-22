import React from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BALL_BODY_NAME, GOAL_CONFIG } from "./config/gameConfig";

const { triggerState, useCompoundBodyMock, useBoxMock, sceneMock, useGLTFMock } = vi.hoisted(() => {
  const triggerState = { factory: null };
  const useCompoundBodyMock = vi.fn(() => [React.createRef()]);
  const useBoxMock = vi.fn((factory) => {
    triggerState.factory = factory;
    return [React.createRef()];
  });
  const sceneMock = {
    traverse: vi.fn(),
  };
  const useGLTFMock = vi.fn(() => ({
    scene: {
      clone: () => sceneMock,
    },
  }));
  useGLTFMock.preload = vi.fn();

  return { triggerState, useCompoundBodyMock, useBoxMock, sceneMock, useGLTFMock };
});

vi.mock("@react-three/cannon", () => ({
  useCompoundBody: (...args) => useCompoundBodyMock(...args),
  useBox: (...args) => useBoxMock(...args),
}));

vi.mock("@react-three/drei", () => ({
  useGLTF: useGLTFMock,
}));

import GoalNet from "./GoalNet";

function triggerCollision(event) {
  const triggerConfig = triggerState.factory?.();
  triggerConfig?.onCollide?.(event);
}

describe("GoalNet", () => {
  beforeEach(() => {
    triggerState.factory = null;
    useCompoundBodyMock.mockClear();
    useBoxMock.mockClear();
    sceneMock.traverse.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires onGoal for ball collisions and respects debounce lock", () => {
    const onGoal = vi.fn();
    let nowMs = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);

    render(
      <GoalNet
        position={[0, 0.5, -78]}
        rotation={[0, 0, 0]}
        scale={2}
        goalId="teamOne"
        active
        onGoal={onGoal}
      />
    );

    triggerCollision({ body: { name: BALL_BODY_NAME } });
    nowMs += 100;
    triggerCollision({ body: { name: BALL_BODY_NAME } });
    nowMs += GOAL_CONFIG.TRIGGER_DEBOUNCE_MS + 1;
    triggerCollision({ body: { name: BALL_BODY_NAME } });

    expect(onGoal).toHaveBeenCalledTimes(2);
    expect(onGoal).toHaveBeenNthCalledWith(1, "teamOne");
    expect(onGoal).toHaveBeenNthCalledWith(2, "teamOne");
  });

  it("ignores non-ball bodies and inactive goals", () => {
    const onGoal = vi.fn();
    vi.spyOn(performance, "now").mockReturnValue(1000);

    const { rerender } = render(
      <GoalNet
        position={[0, 0.5, 78]}
        rotation={[0, Math.PI, 0]}
        scale={2}
        goalId="teamTwo"
        active
        onGoal={onGoal}
      />
    );

    triggerCollision({ body: { name: "player" } });
    expect(onGoal).not.toHaveBeenCalled();

    rerender(
      <GoalNet
        position={[0, 0.5, 78]}
        rotation={[0, Math.PI, 0]}
        scale={2}
        goalId="teamTwo"
        active={false}
        onGoal={onGoal}
      />
    );

    triggerCollision({ body: { name: BALL_BODY_NAME } });
    expect(onGoal).not.toHaveBeenCalled();
  });
});
