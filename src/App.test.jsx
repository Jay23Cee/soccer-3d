import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { CAMERA_CONFIG } from "./config/gameConfig";

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
  Canvas: ({ children }) => <div data-testid="canvas">{stripUnsupportedCanvasNodes(children)}</div>,
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

vi.mock("./camera/CameraDirector", () => ({ default: () => null }));
vi.mock("./SoccerField", () => ({ default: () => <div data-testid="soccer-field" /> }));
let replayStateOverride = null;
vi.mock("./hooks/useReplayOrchestration", () => ({
  default: ({ setReplayState, setReplayFrame }) => {
    React.useEffect(() => {
      if (!replayStateOverride) {
        return;
      }

      setReplayState(replayStateOverride);
      setReplayFrame(null);
    }, [setReplayFrame, setReplayState]);
  },
}));
let mockSnapshotTime = 0;
vi.mock("./SoccerBallModel", () => ({
  default: ({
    onPowerZoneEnter,
    onShotChargeChange,
    onShotEvent,
    onPossessionChange,
    onBallSnapshot,
    passCommand,
    shotPowerMultiplier,
  }) => (
      <div data-testid="soccer-ball" data-shot-power={shotPowerMultiplier}>
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
        <button
          type="button"
          data-testid="mock-shot"
          onClick={() => onShotEvent?.({ type: "shot", teamId: "teamOne" })}
        >
          mock-shot
        </button>
        <button
          type="button"
          data-testid="mock-save"
          onClick={() => onShotEvent?.({ type: "save", teamId: "teamOne" })}
        >
          mock-save
        </button>
        <button
          type="button"
          data-testid="mock-ball-pop"
          onClick={() => onShotEvent?.({ type: "ball_pop", teamId: "teamOne" })}
        >
          mock-ball-pop
        </button>
        <button
          type="button"
          data-testid="mock-possession"
          onClick={() => onPossessionChange?.({ teamId: "teamOne", playerId: "player_one" })}
        >
          mock-possession
        </button>
        <button
          type="button"
          data-testid="mock-snapshot"
          onClick={() => {
            mockSnapshotTime += 34;
            onBallSnapshot?.({
              timestampMs: mockSnapshotTime,
              position: [0, 1.1, 0],
              velocity: [0, 0, -4],
            });
          }}
        >
          mock-snapshot
        </button>
        <div data-testid="pass-command">{passCommand?.id || ""}</div>
      </div>
    ),
}));
vi.mock("./SoccerPlayer", () => ({
  default: ({ playerId, isActive, isGoalkeeper }) => (
    <div
      data-testid={isGoalkeeper ? "soccer-keeper" : "soccer-player"}
      data-player-id={playerId}
      data-is-active={isActive ? "true" : "false"}
    />
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

beforeEach(() => {
  mockSnapshotTime = 0;
  replayStateOverride = null;
});

function startAndSkipIntro() {
  fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));
}

describe("App", () => {
  test("renders idle state with match story HUD", () => {
    render(<App />);

    expect(screen.getByText("Soccer 3D")).toBeInTheDocument();
    expect(screen.getByText("Status: Idle")).toBeInTheDocument();
    expect(screen.getByText("Match Story")).toBeInTheDocument();
    expect(screen.getByTestId("replay-state")).toHaveTextContent("idle");
    expect(screen.getAllByTestId("soccer-player")).toHaveLength(4);
    expect(screen.getAllByTestId("soccer-keeper")).toHaveLength(2);
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

  test("shows six soccer camera POV options in the menu", () => {
    render(<App />);

    const povSelect = screen.getByLabelText("Camera POV");
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.BROADCAST_WIDE);

    const optionLabels = Array.from(povSelect.querySelectorAll("option")).map((option) =>
      option.textContent?.trim()
    );

    expect(optionLabels).toEqual([
      "Broadcast Wide",
      "Player Chase",
      "Behind Player (West of Ball)",
      "Attacking Third",
      "Goal Line",
      "Free Roam",
    ]);

    fireEvent.change(povSelect, { target: { value: CAMERA_CONFIG.MODES.FREE_ROAM } });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);
  });

  test("shows movement mapping select with Auto default", () => {
    render(<App />);

    const mappingSelect = screen.getByLabelText("Movement Mapping");
    expect(mappingSelect).toHaveValue("auto");
  });

  test("supports camera hotkeys for cycle and direct slot jump", () => {
    render(<App />);

    const povSelect = screen.getByLabelText("Camera POV");
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.BROADCAST_WIDE);

    fireEvent.keyDown(window, { key: "e" });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.PLAYER_CHASE);

    fireEvent.keyDown(window, { key: "q" });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.BROADCAST_WIDE);

    fireEvent.keyDown(window, { key: "4" });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.ATTACKING_THIRD);

    fireEvent.keyDown(window, { key: "6" });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);
  });

  test("keeps Camera POV select enabled while replay is playing", async () => {
    replayStateOverride = {
      mode: "playing",
      isPlaying: true,
      canSkip: true,
      eventType: "goal",
      eventId: "evt-replay",
      currentPlaybackIndex: 3,
      totalPlaybackFrames: 18,
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Status: Idle \| Replay/i)).toBeInTheDocument();
    });

    const povSelect = screen.getByLabelText("Camera POV");
    expect(povSelect).toBeEnabled();
  });

  test("supports camera hotkeys while replay is playing", async () => {
    replayStateOverride = {
      mode: "playing",
      isPlaying: true,
      canSkip: true,
      eventType: "goal",
      eventId: "evt-replay",
      currentPlaybackIndex: 3,
      totalPlaybackFrames: 18,
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Status: Idle \| Replay/i)).toBeInTheDocument();
    });

    const povSelect = screen.getByLabelText("Camera POV");
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.BROADCAST_WIDE);

    fireEvent.keyDown(window, { key: "e" });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.PLAYER_CHASE);

    fireEvent.keyDown(window, { key: "4" });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.ATTACKING_THIRD);
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
  });

  test("pause button toggles to resume", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("Status: Paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  test("increments score and appends goal event ticker entry", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("goal-teamOne"));

    expect(screen.getByTestId("score-team-one")).toHaveTextContent("1");
    expect(screen.getByTestId("event-ticker")).toHaveTextContent("Brazil goal");
  });

  test("updates shots and saves stats via shot events", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-shot"));
    fireEvent.click(screen.getByTestId("mock-save"));
    fireEvent.click(screen.getByTestId("mock-ball-pop"));

    expect(screen.getByText(/Shots/i)).toHaveTextContent("1 - 0");
    expect(screen.getByText(/Saves/i)).toHaveTextContent("1 - 0");
  });

  test("restart match resets score and replay state", () => {
    render(<App />);
    startAndSkipIntro();
    fireEvent.click(screen.getByTestId("goal-teamOne"));
    fireEvent.click(screen.getByRole("button", { name: "Restart Match" }));

    expect(screen.getByTestId("score-team-one")).toHaveTextContent("0");
    expect(screen.getByText("Status: Pre-match Intro")).toBeInTheDocument();
    expect(screen.getByTestId("replay-state")).toHaveTextContent("idle");
  });

  test("allows manual Tab switching when Team One has no possession", () => {
    render(<App />);
    startAndSkipIntro();

    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player One");
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player Two");
  });

  test("blocks manual Tab switching while Team One has possession", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-possession"));
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player One");
  });

  test("S pass auto-switches to teammate and emits pass command", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-possession"));
    fireEvent.keyDown(window, { key: "s" });

    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player Two");
    expect(screen.getByTestId("pass-command").textContent).toMatch(/^pass-player_one-player_two-/);
  });
});
