import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { COMBO_CONFIG, PLAYER_STAMINA_CONFIG } from "./config/gameConfig";

const UNSUPPORTED_CANVAS_TAGS = new Set(["hemisphereLight", "directionalLight", "fog"]);

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
vi.mock("./SoccerBallModel", () => ({
  default: ({
    onPowerZoneEnter,
    onShotChargeChange,
    shotPowerMultiplier,
    playerPosition,
    playerRotation,
  }) => (
    <div
      data-testid="soccer-ball"
      data-shot-power={shotPowerMultiplier}
      data-player-position={JSON.stringify(playerPosition)}
      data-player-rotation={JSON.stringify(playerRotation)}
    >
      <button
        type="button"
        data-testid="trigger-zone"
        onClick={() =>
          onPowerZoneEnter?.({
            id: `zone-${Date.now()}`,
            type: "speed",
            color: "#1dd75f",
            radius: 7,
            position: [0, 0],
          })
        }
      >
        trigger-zone
      </button>
      <button
        type="button"
        data-testid="mock-charge"
        onClick={() =>
          onShotChargeChange?.({
            isCharging: true,
            chargeRatio: 0.62,
            isPerfect: false,
            canShoot: true,
          })
        }
      >
        mock-charge
      </button>
    </div>
  ),
}));
vi.mock("./SoccerPlayer", () => ({
  default: ({ playerId, isActive }) => (
    <div data-testid="soccer-player" data-player-id={playerId} data-is-active={isActive ? "true" : "false"} />
  ),
}));
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

function startAndSkipIntro() {
  fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));
}

function getBallState() {
  const ball = screen.getByTestId("soccer-ball");
  return {
    shotPower: Number(ball.getAttribute("data-shot-power")),
    playerPosition: JSON.parse(ball.getAttribute("data-player-position") || "[]"),
    playerRotation: JSON.parse(ball.getAttribute("data-player-rotation") || "[]"),
  };
}

function readStaminaValue() {
  return Number((screen.getByTestId("stamina-value").textContent || "0").replace("%", ""));
}

describe("App", () => {
  test("renders idle state before match starts", () => {
    render(<App />);

    expect(screen.getByText("Soccer 3D")).toBeInTheDocument();
    expect(screen.getByText("Status: Idle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Match" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  test("renders two players in the scene", () => {
    render(<App />);

    expect(screen.getAllByTestId("soccer-player")).toHaveLength(2);
  });

  test("allows switching between player and ball control targets", () => {
    render(<App />);

    const playerControlButton = screen.getByRole("button", { name: "Control Player" });
    const ballControlButton = screen.getByRole("button", { name: "Control Ball" });

    expect(playerControlButton).toHaveAttribute("aria-pressed", "true");
    expect(ballControlButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("shot-meter")).toBeInTheDocument();

    fireEvent.click(ballControlButton);

    expect(playerControlButton).toHaveAttribute("aria-pressed", "false");
    expect(ballControlButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("shot-meter")).not.toBeInTheDocument();
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

    startAndSkipIntro();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(screen.getByText("Status: Paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  test("restart match resets timer to full duration and returns to intro", () => {
    vi.useFakeTimers();
    render(<App />);

    startAndSkipIntro();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("match-clock")).toHaveTextContent("1:58");
    fireEvent.click(screen.getByTestId("trigger-zone"));
    fireEvent.click(screen.getByTestId("mock-charge"));
    expect(screen.getByTestId("combo-status")).toHaveTextContent("Streak 1");
    expect(screen.getByTestId("shot-meter-value")).toHaveTextContent("62%");
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player Two");

    fireEvent.click(screen.getByRole("button", { name: "Restart Match" }));

    expect(screen.getByTestId("match-clock")).toHaveTextContent("2:00");
    expect(screen.getByText("Status: Pre-match Intro")).toBeInTheDocument();
    expect(screen.getByTestId("combo-status")).toHaveTextContent("None");
    expect(screen.getByTestId("shot-meter-value")).toHaveTextContent("0%");
    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player One");
    expect(screen.getByTestId("stamina-value")).toHaveTextContent("100%");

    vi.useRealTimers();
  });

  test("increments score when a goal is triggered during play", () => {
    render(<App />);

    startAndSkipIntro();
    fireEvent.click(screen.getByTestId("goal-teamOne"));

    expect(screen.getByTestId("score-team-one")).toHaveTextContent("1");
    expect(screen.getByTestId("score-team-two")).toHaveTextContent("0");
  });

  test("combo streak increments on consecutive captures and resets on timeout", () => {
    vi.useFakeTimers();
    render(<App />);

    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("trigger-zone"));
    expect(screen.getByTestId("combo-status")).toHaveTextContent("Streak 1");

    fireEvent.click(screen.getByTestId("trigger-zone"));
    expect(screen.getByTestId("combo-status")).toHaveTextContent("Streak 2");

    act(() => {
      vi.advanceTimersByTime(COMBO_CONFIG.WINDOW_MS + 200);
    });

    expect(screen.getByTestId("combo-status")).toHaveTextContent("None");
    vi.useRealTimers();
  });

  test("switches active player with Tab and updates ball follow target", () => {
    render(<App />);
    startAndSkipIntro();

    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player One");
    expect(getBallState().playerPosition).toEqual([-6, 0, 22]);

    fireEvent.keyDown(window, { key: "Tab" });

    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player Two");
    expect(getBallState().playerPosition).toEqual([6, 0, 22]);
  });

  test("player one has higher kick power multiplier than player two", () => {
    render(<App />);
    startAndSkipIntro();

    const playerOneShotPower = getBallState().shotPower;
    fireEvent.keyDown(window, { key: "Tab" });
    const playerTwoShotPower = getBallState().shotPower;

    expect(playerOneShotPower).toBeGreaterThan(playerTwoShotPower);
  });

  test("sprint drains stamina only while moving and then regenerates", () => {
    vi.useFakeTimers();
    render(<App />);
    startAndSkipIntro();

    expect(readStaminaValue()).toBe(100);

    fireEvent.keyDown(window, { key: "Shift" });
    fireEvent.keyDown(window, { key: "ArrowUp" });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    const drainedStamina = readStaminaValue();
    expect(drainedStamina).toBeLessThan(100);
    expect(screen.getByTestId("sprint-state")).toHaveTextContent("ON");

    fireEvent.keyUp(window, { key: "ArrowUp" });
    fireEvent.keyUp(window, { key: "Shift" });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(readStaminaValue()).toBeGreaterThan(drainedStamina);
    expect(screen.getByTestId("sprint-state")).toHaveTextContent("OFF");
    vi.useRealTimers();
  });

  test("low stamina applies kick power penalty", () => {
    vi.useFakeTimers();
    render(<App />);
    startAndSkipIntro();

    fireEvent.keyDown(window, { key: "Shift" });
    fireEvent.keyDown(window, { key: "ArrowUp" });

    act(() => {
      vi.advanceTimersByTime(3600);
    });

    fireEvent.keyUp(window, { key: "ArrowUp" });
    fireEvent.keyUp(window, { key: "Shift" });

    expect(readStaminaValue()).toBeLessThanOrEqual(
      Math.round(PLAYER_STAMINA_CONFIG.LOW_THRESHOLD_RATIO * 100)
    );
    expect(getBallState().shotPower).toBeCloseTo(1.25 * PLAYER_STAMINA_CONFIG.LOW_KICK_MULTIPLIER);
    vi.useRealTimers();
  });
});
