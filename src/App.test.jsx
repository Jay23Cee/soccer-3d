import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }) => <div data-testid="canvas">{children}</div>,
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  PerspectiveCamera: () => null,
  Environment: () => null,
  Html: ({ children }) => <div>{children}</div>,
}));

vi.mock(
  "@react-three/cannon",
  () => ({
    Physics: ({ children }) => <div>{children}</div>,
  }),
  { virtual: true }
);

vi.mock("./SoccerField", () => ({ default: () => <div data-testid="soccer-field" /> }));
vi.mock("./SoccerBallModel", () => ({ default: () => <div data-testid="soccer-ball" /> }));
vi.mock("./GoalNet", () => ({
  default: ({ goalId, onGoal, active }) => (
    <button
      type="button"
      data-testid={`goal-${goalId}`}
      onClick={() => onGoal(goalId)}
      disabled={!active}
    >
      goal-{goalId}
    </button>
  ),
}));

let App;

beforeAll(async () => {
  ({ default: App } = await import("./App"));
});

describe("App", () => {
  test("renders idle state before match starts", () => {
    render(<App />);

    expect(screen.getByText("Soccer 3D")).toBeInTheDocument();
    expect(screen.getByText("Status: Idle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Match" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  test("starts match and shows in-play controls", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));

    expect(screen.getByText("Status: In Play")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Ball" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart Match" })).toBeInTheDocument();
  });

  test("pause button toggles to resume", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(screen.getByText("Status: Paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  test("restart match resets timer to full duration", () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Time: 1:58")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restart Match" }));

    expect(screen.getByText("Time: 2:00")).toBeInTheDocument();

    vi.useRealTimers();
  });

  test("increments score when a goal is triggered during play", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
    fireEvent.click(screen.getByTestId("goal-teamOne"));

    expect(screen.getByText("Team 1: 1")).toBeInTheDocument();
    expect(screen.getByText("Team 2: 0")).toBeInTheDocument();
  });
});
