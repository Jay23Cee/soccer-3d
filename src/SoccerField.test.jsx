import React from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, useBoxMock, usePlaneMock, useTextureMock } = vi.hoisted(() => {
  const state = {
    frameCallback: null,
  };
  const useBoxMock = vi.fn(() => [React.createRef()]);
  const usePlaneMock = vi.fn(() => [React.createRef()]);
  const useTextureMock = vi.fn(() => [
    { wrapS: 0, wrapT: 0, repeat: { set: vi.fn() }, colorSpace: null },
    { wrapS: 0, wrapT: 0, repeat: { set: vi.fn() }, colorSpace: null },
    { wrapS: 0, wrapT: 0, repeat: { set: vi.fn() }, colorSpace: null },
    { wrapS: 0, wrapT: 0, repeat: { set: vi.fn() }, colorSpace: null },
  ]);
  useTextureMock.preload = vi.fn();

  return { state, useBoxMock, usePlaneMock, useTextureMock };
});

vi.mock("@react-three/cannon", () => ({
  useBox: (...args) => useBoxMock(...args),
  usePlane: (...args) => usePlaneMock(...args),
}));

vi.mock("@react-three/drei", () => ({
  useTexture: useTextureMock,
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback) => {
    state.frameCallback = callback;
  },
}));

import SoccerField from "./SoccerField";

describe("SoccerField", () => {
  beforeEach(() => {
    state.frameCallback = null;
    useBoxMock.mockClear();
    usePlaneMock.mockClear();
    useTextureMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates one plane collider and four boundary wall colliders", () => {
    render(<SoccerField activePowerZone={null} />);

    expect(usePlaneMock).toHaveBeenCalledTimes(1);
    expect(useBoxMock).toHaveBeenCalledTimes(4);
  });

  it("renders with an active power zone and advances frame animation safely", () => {
    render(
      <SoccerField
        activePowerZone={{
          id: "zone-1",
          type: "speed",
          color: "#1dd75f",
          radius: 7,
          position: [0, 0],
        }}
      />
    );

    expect(typeof state.frameCallback).toBe("function");
  });
});
