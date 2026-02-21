import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

const UNSUPPORTED_CANVAS_TAGS = new Set(["hemisphereLight", "directionalLight"]);

function stripUnsupportedCanvasNodes(children) {
  return React.Children.map(children, (child) => {
    if (
      React.isValidElement(child) &&
      typeof child.type === "string" &&
      UNSUPPORTED_CANVAS_TAGS.has(child.type)
    ) {
      return null;
    }

    return child;
  });
}

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }) => (
    <div data-testid="canvas">{stripUnsupportedCanvasNodes(children)}</div>
  ),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  PerspectiveCamera: () => null,
  Environment: () => null,
  Html: ({ children }) => <div>{children}</div>,
  Billboard: ({ children }) => <div>{children}</div>,
  Text: ({ children }) => <span>{children}</span>,
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
vi.mock("./SoccerPlayer", () => ({ default: () => <div data-testid="soccer-player" /> }));
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

  test("allows switching between player and ball control targets", () => {
    render(<App />);

    const playerControlButton = screen.getByRole("button", { name: "Control Player" });
    const ballControlButton = screen.getByRole("button", { name: "Control Ball" });

    expect(playerControlButton).toHaveAttribute("aria-pressed", "true");
    expect(ballControlButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(ballControlButton);

    expect(playerControlButton).toHaveAttribute("aria-pressed", "false");
    expect(ballControlButton).toHaveAttribute("aria-pressed", "true");
  });

  test("starts match into intro and can skip to in-play controls", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));

    expect(screen.getByText("Status: Pre-match Intro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip Intro" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));

    expect(screen.getByText("Status: In Play")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Ball" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart Match" })).toBeInTheDocument();
  });

  test("pause button toggles to resume", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(screen.getByText("Status: Paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  test("restart match resets timer to full duration and returns to intro", () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("match-clock")).toHaveTextContent("1:58");

    fireEvent.click(screen.getByRole("button", { name: "Restart Match" }));

    expect(screen.getByTestId("match-clock")).toHaveTextContent("2:00");
    expect(screen.getByText("Status: Pre-match Intro")).toBeInTheDocument();

    vi.useRealTimers();
  });

  test("increments score when a goal is triggered during play", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));
    fireEvent.click(screen.getByTestId("goal-teamOne"));

    expect(screen.getByTestId("score-team-one")).toHaveTextContent("1");
    expect(screen.getByTestId("score-team-two")).toHaveTextContent("0");
  });
});
