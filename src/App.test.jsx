import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import {
  BALL_RESET_DELAY_MS,
  CAMERA_CONFIG,
  KICKOFF_CONFIG,
  PLAYER_PROFILES,
} from "./config/gameConfig";

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
vi.mock("./hooks/useOutfieldAI", () => ({ default: () => null }));
vi.mock("./hooks/useGoalkeeperAI", () => ({ default: () => null }));
let replayStateOverride = null;
let replayFrameOverride = null;
let replayHookControls = null;
let autoResolveKickoffCommands = true;
vi.mock("./hooks/useReplayOrchestration", () => ({
  default: ({ replayDirectorRef, setReplayState, setReplayFrame }) => {
    React.useEffect(() => {
      replayHookControls = {
        replayDirectorRef,
        setReplayState,
        setReplayFrame,
      };

      if (replayStateOverride) {
        setReplayState(replayStateOverride);
      }
      setReplayFrame(replayFrameOverride);

      return () => {
        if (replayHookControls?.setReplayState === setReplayState) {
          replayHookControls = null;
        }
      };
    }, [replayDirectorRef, setReplayFrame, setReplayState]);
  },
}));
let mockSnapshotTime = 0;
vi.mock("./SoccerBallModel", () => ({
  default: ({
    kickoffRef,
    onPowerZoneEnter,
    onShotChargeChange,
    onShotEvent,
    onPossessionChange,
    onBallSnapshot,
    ballActionCommand,
    onBallActionResolved,
    shotPowerMultiplier,
  }) => {
      const [kickoffSetup, setKickoffSetup] = React.useState(null);
      const lastAutoResolvedKickoffIdRef = React.useRef(null);

      React.useEffect(() => {
        if (!kickoffRef) {
          return undefined;
        }

        const kickoffHandler = (nextKickoffSetup) => {
          setKickoffSetup(nextKickoffSetup);
        };
        kickoffRef.current = kickoffHandler;

        return () => {
          if (kickoffRef?.current === kickoffHandler) {
            kickoffRef.current = null;
          }
        };
      }, [kickoffRef]);

      React.useEffect(() => {
        if (
          !autoResolveKickoffCommands ||
          !ballActionCommand?.id?.startsWith("kickoff-") ||
          lastAutoResolvedKickoffIdRef.current === ballActionCommand.id
        ) {
          return;
        }

        lastAutoResolvedKickoffIdRef.current = ballActionCommand.id;
        onPossessionChange?.(null);
        onBallActionResolved?.({
          id: ballActionCommand.id,
          accepted: true,
          actorId: ballActionCommand.actorId,
          teamId: ballActionCommand.teamId,
          type: ballActionCommand.type,
          targetPlayerId: ballActionCommand.targetPlayerId || null,
        });
      }, [ballActionCommand, onBallActionResolved, onPossessionChange]);

      return (
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
          data-testid="mock-possession-player-two"
          onClick={() => onPossessionChange?.({ teamId: "teamOne", playerId: "player_two" })}
        >
          mock-possession-player-two
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
        <button
          type="button"
          data-testid="resolve-ball-action"
          onClick={() => {
            if (!ballActionCommand) {
              return;
            }

            onPossessionChange?.(null);
            onBallActionResolved?.({
              id: ballActionCommand.id,
              accepted: true,
              actorId: ballActionCommand.actorId,
              teamId: ballActionCommand.teamId,
              type: ballActionCommand.type,
              targetPlayerId: ballActionCommand.targetPlayerId || null,
            });
          }}
        >
          resolve-ball-action
        </button>
        <div data-testid="ball-action-command">{ballActionCommand?.id || ""}</div>
        <div data-testid="kickoff-setup">{kickoffSetup ? JSON.stringify(kickoffSetup) : ""}</div>
      </div>
    );
  },
}));
vi.mock("./SoccerPlayer", () => ({
  default: ({ playerId, isActive, isGoalkeeper, position }) => (
    <div
      data-testid={isGoalkeeper ? "soccer-keeper" : "soccer-player"}
      data-player-id={playerId}
      data-is-active={isActive ? "true" : "false"}
      data-position={JSON.stringify(position)}
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
  replayFrameOverride = null;
  replayHookControls = null;
  autoResolveKickoffCommands = true;
});

function startAndSkipIntro() {
  fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));
}

function syncReplayDirector(nowMs) {
  act(() => {
    const nextState = replayHookControls.replayDirectorRef.current.update(nowMs);
    replayHookControls.setReplayState(nextState);
    replayHookControls.setReplayFrame(replayHookControls.replayDirectorRef.current.getCurrentFrame());
  });
}

function getMockPlayer(playerId) {
  return screen
    .getAllByTestId("soccer-player")
    .find((playerNode) => playerNode.dataset.playerId === playerId);
}

function seedReplayBuffer(frameCount = 10) {
  for (let index = 0; index < frameCount; index += 1) {
    fireEvent.click(screen.getByTestId("mock-snapshot"));
  }
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

  test("shows difficulty selector and match readability labels", () => {
    render(<App />);

    expect(screen.getByLabelText("Difficulty")).toHaveValue("normal");
    expect(screen.getByTestId("hud-possession-owner")).toHaveTextContent("Loose Ball");
    expect(screen.getByTestId("hud-cpu-phase")).toHaveTextContent("recover");
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

  test("auto-switches to the current Team One possessor", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-possession-player-two"));
    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player Two");
  });

  test("S pass transfers control after the ball action resolves", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-possession"));
    fireEvent.keyDown(window, { key: "s" });

    expect(screen.getByTestId("ball-action-command").textContent).toMatch(
      /^pass-player_one-player_two-/
    );
    fireEvent.click(screen.getByTestId("resolve-ball-action"));
    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player Two");
  });

  test("waits for goal replay to finish before resetting the field", () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();
      seedReplayBuffer();

      const playerOneSpawnPosition = JSON.stringify(PLAYER_PROFILES.player_one.startPosition);
      fireEvent.change(screen.getByLabelText("Movement Mapping"), { target: { value: "world" } });
      const preGoalPosition = getMockPlayer("player_one").dataset.position;

      fireEvent.keyDown(window, { key: "ArrowUp" });
      act(() => {
        vi.advanceTimersByTime(96);
      });
      fireEvent.keyUp(window, { key: "ArrowUp" });

      expect(getMockPlayer("player_one").dataset.position).not.toBe(preGoalPosition);

      fireEvent.click(screen.getByTestId("goal-teamOne"));
      act(() => {
        vi.advanceTimersByTime(BALL_RESET_DELAY_MS + 50);
      });

      expect(screen.getByText(/Status: Goal Scored/i)).toBeInTheDocument();
      expect(getMockPlayer("player_one").dataset.position).not.toBe(playerOneSpawnPosition);

      syncReplayDirector(12_000);
      expect(screen.getByText(/Status: Goal Scored \| Replay/i)).toBeInTheDocument();

      syncReplayDirector(13_000);
      expect(screen.getByText("Status: Kickoff")).toBeInTheDocument();
      expect(getMockPlayer("player_one")).toHaveAttribute("data-position", playerOneSpawnPosition);

      act(() => {
        vi.advanceTimersByTime(KICKOFF_CONFIG.POST_GOAL_DELAY_MS);
      });

      expect(screen.getByText("Status: In Play")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("goal replay hands kickoff to the conceding team before live play resumes", () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();
      seedReplayBuffer();
      autoResolveKickoffCommands = false;

      fireEvent.click(screen.getByTestId("goal-teamOne"));
      syncReplayDirector(12_000);
      syncReplayDirector(13_000);

      expect(screen.getByText("Status: Kickoff")).toBeInTheDocument();
      expect(getMockPlayer("player_one")).toHaveAttribute(
        "data-position",
        JSON.stringify(PLAYER_PROFILES.player_one.startPosition)
      );

      act(() => {
        vi.advanceTimersByTime(KICKOFF_CONFIG.POST_GOAL_DELAY_MS);
      });

      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"teamId":"teamTwo"');
      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"takerId":"opponent_one"');
      expect(screen.getByTestId("ball-action-command").textContent).toMatch(
        /^kickoff-opponent_one-opponent_two-/
      );

      fireEvent.click(screen.getByTestId("resolve-ball-action"));
      expect(screen.getByText("Status: In Play")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("skipping a goal replay still triggers the field reset", () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();
      seedReplayBuffer();

      fireEvent.click(screen.getByTestId("goal-teamOne"));
      syncReplayDirector(12_000);
      expect(screen.getByText(/Status: Goal Scored \| Replay/i)).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "r" });
      syncReplayDirector(12_001);

      expect(screen.getByText("Status: Kickoff")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(KICKOFF_CONFIG.POST_GOAL_DELAY_MS);
      });

      expect(screen.getByText("Status: In Play")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
