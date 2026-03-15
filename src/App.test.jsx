import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import {
  BALL_RESET_DELAY_MS,
  CAMERA_CONFIG,
  GOALKEEPER_CONFIG,
  KICKOFF_CONFIG,
  MATCH_DURATION_SECONDS,
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

let latestOrbitControlsProps = null;
vi.mock("@react-three/drei", () => ({
  OrbitControls: (props) => {
    latestOrbitControlsProps = props;
    return <div data-testid="orbit-controls" data-enabled={props.enabled ? "true" : "false"} />;
  },
  PerspectiveCamera: () => null,
  Environment: () => null,
  Html: ({ children }) => <div>{children}</div>,
  Billboard: ({ children }) => <div>{children}</div>,
  Text: ({ children, ...props }) => <div data-testid={props["data-testid"] || undefined}>{children}</div>,
}));

vi.mock(
  "@react-three/cannon",
  () => ({
    Physics: ({ children }) => <div>{children}</div>,
  }),
  { virtual: true }
);

let latestCameraDirectorProps = null;
vi.mock("./camera/CameraDirector", () => ({
  default: (props) => {
    latestCameraDirectorProps = props;
    return null;
  },
}));
vi.mock("./SoccerField", () => ({ default: () => <div data-testid="soccer-field" /> }));
let latestOutfieldAiProps = null;
vi.mock("./hooks/useOutfieldAI", () => ({
  default: (props) => {
    latestOutfieldAiProps = props;
    return null;
  },
}));
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
    resetRef,
    kickoffRef,
    onPowerZoneEnter,
    onShotChargeChange,
    onShotEvent,
    onPossessionChange,
    onBallSnapshot,
    onOutOfBounds,
    ballActionCommand,
    onBallActionResolved,
    tackleCommand,
    onTackleResolved,
    shotPowerMultiplier,
    players = [],
  }) => {
      const [kickoffSetup, setKickoffSetup] = React.useState(null);
      const lastAutoResolvedKickoffIdRef = React.useRef(null);
      const emitAttachedPossession = (teamId, playerId) => {
        const actor = players.find((candidate) => candidate.playerId === playerId);
        const actorPosition = actor?.position || [0, 0, 0];

        onPossessionChange?.({ teamId, playerId });
        mockSnapshotTime += 34;
        onBallSnapshot?.({
          timestampMs: mockSnapshotTime,
          position: [actorPosition[0], 1.1, actorPosition[2]],
          velocity: [0, 0, 0],
          mode: "attached",
          possession: {
            teamId,
            playerId,
          },
        });
      };

      React.useEffect(() => {
        if (!resetRef) {
          return undefined;
        }

        const resetHandler = () => {};
        resetRef.current = resetHandler;

        return () => {
          if (resetRef?.current === resetHandler) {
            resetRef.current = null;
          }
        };
      }, [resetRef]);

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
          data-testid="mock-opponent-possession"
          onClick={() => onPossessionChange?.({ teamId: "teamTwo", playerId: "opponent_one" })}
        >
          mock-opponent-possession
        </button>
        <button
          type="button"
          data-testid="mock-keeper-possession"
          onClick={() => emitAttachedPossession("teamOne", "keeper-team-one")}
        >
          mock-keeper-possession
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
              mode: "loose",
              possession: null,
            });
          }}
        >
          mock-snapshot
        </button>
        <button
          type="button"
          data-testid="mock-out-throw-in"
          onClick={() =>
            onOutOfBounds?.({
              position: [74, 1, 14],
              velocity: [0, 0, 0],
              mode: "released",
              possession: null,
              lastTouch: {
                teamId: "teamOne",
                playerId: "player_one",
              },
            })
          }
        >
          mock-out-throw-in
        </button>
        <button
          type="button"
          data-testid="mock-out-goal-kick"
          onClick={() =>
            onOutOfBounds?.({
              position: [8, 1, 88],
              velocity: [0, 0, 0],
              mode: "released",
              possession: null,
              lastTouch: {
                teamId: "teamTwo",
                playerId: "opponent_one",
              },
            })
          }
        >
          mock-out-goal-kick
        </button>
        <button
          type="button"
          data-testid="mock-out-corner"
          onClick={() =>
            onOutOfBounds?.({
              position: [-6, 1, -88],
              velocity: [0, 0, 0],
              mode: "released",
              possession: null,
              lastTouch: {
                teamId: "teamTwo",
                playerId: "opponent_one",
              },
            })
          }
        >
          mock-out-corner
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
        <button
          type="button"
          data-testid="resolve-tackle"
          onClick={() => {
            if (!tackleCommand) {
              return;
            }

            onPossessionChange?.(null);
            onTackleResolved?.({
              id: tackleCommand.id,
              accepted: true,
              actorId: tackleCommand.actorId,
              teamId: tackleCommand.teamId,
              carrierId: tackleCommand.carrierId || null,
            });
          }}
        >
          resolve-tackle
        </button>
        <div data-testid="ball-action-command">{ballActionCommand?.id || ""}</div>
        <div data-testid="tackle-command">{tackleCommand?.id || ""}</div>
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
  default: ({ goalId, goalSide, onGoal, active }) => (
    <button
      type="button"
      data-testid={`goal-${goalId}`}
      data-goal-id={goalId}
      data-goal-side={goalSide === "negativeZ" ? "negative-z" : "positive-z"}
      onClick={() => onGoal(goalSide || goalId)}
      disabled={!active}
    >
      goal-{goalId}
    </button>
  ),
}));

let App;
let mockAudioInstances = [];
let originalAudio = null;

beforeAll(async () => {
  ({ default: App } = await import("./App"));
});

beforeEach(() => {
  mockSnapshotTime = 0;
  latestCameraDirectorProps = null;
  latestOrbitControlsProps = null;
  latestOutfieldAiProps = null;
  replayStateOverride = null;
  replayFrameOverride = null;
  replayHookControls = null;
  autoResolveKickoffCommands = true;
  delete window.__SOCCER_E2E__;
  delete window.__SOCCER_TEST_API__;
  delete window.matchMedia;
  mockAudioInstances = [];
  originalAudio = globalThis.Audio;
  globalThis.Audio = vi.fn().mockImplementation(function MockAudio(src) {
    this.src = src;
    this.preload = "";
    this.volume = 1;
    this.currentTime = 0;
    this.play = vi.fn(() => Promise.resolve());
    this.pause = vi.fn();
    mockAudioInstances.push(this);
  });
});

afterEach(() => {
  globalThis.Audio = originalAudio;
});

function startAndSkipIntro() {
  fireEvent.click(screen.getByRole("button", { name: "Press Start" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));
}

function openMatchSetup() {
  fireEvent.click(screen.getByRole("button", { name: "Match Setup" }));
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

function getMockKeeper(playerId) {
  return screen
    .getAllByTestId("soccer-keeper")
    .find((playerNode) => playerNode.dataset.playerId === playerId);
}

function seedReplayBuffer(frameCount = 10) {
  for (let index = 0; index < frameCount; index += 1) {
    fireEvent.click(screen.getByTestId("mock-snapshot"));
  }
}

function primeCpuAutomationState() {
  act(() => {
    latestOutfieldAiProps.teamAttackMemoryRef.current = {
      teamOne: {
        possessionStartMs: null,
        ballZone: "midfield",
        actionLocks: {},
      },
      teamTwo: {
        possessionStartMs: 2_400,
        ballZone: "attacking_third",
        actionLocks: {
          opponent_one: {
            mode: "carry",
            expiresAtMs: 99_999,
          },
        },
      },
    };

    latestOutfieldAiProps.setBallActionCommand({
      id: "cpu-shot-opponent_one-seeded",
      actorId: "opponent_one",
      teamId: "teamTwo",
      type: "shot",
      targetPlayerId: null,
      targetPosition: [6, 0, 78],
      power: 1.2,
    });
  });
}

describe("App", () => {
  test("renders the Goal Rush title screen by default", () => {
    render(<App />);

    const landingHero = screen.getByTestId("landing-hero");

    expect(within(landingHero).getByRole("heading", { name: /Goal Rush/i })).toBeInTheDocument();
    expect(within(landingHero).getByText("Status: Idle")).toBeInTheDocument();
    expect(within(landingHero).getByRole("button", { name: "Press Start" })).toBeInTheDocument();
    expect(within(landingHero).getByRole("button", { name: "Match Setup" })).toBeInTheDocument();
    expect(screen.queryByTestId("broadcast-scoreboard")).not.toBeInTheDocument();
    expect(document.querySelector(".overlay")).not.toBeInTheDocument();
    expect(screen.queryByText("Match Story")).not.toBeInTheDocument();
    expect(screen.queryByTestId("replay-state")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("soccer-player")).toHaveLength(4);
    expect(screen.getAllByTestId("soccer-keeper")).toHaveLength(2);
    expect(latestCameraDirectorProps.mode).toBe(CAMERA_CONFIG.MODES.LANDING_HERO);
  });

  test("opens the dedicated landing setup menu with persistent back and start actions", () => {
    render(<App />);
    openMatchSetup();

    const landingHero = screen.getByTestId("landing-hero");

    expect(within(landingHero).getByText("Match Setup")).toBeInTheDocument();
    expect(within(landingHero).getByTestId("landing-menu-body")).toBeInTheDocument();
    expect(within(landingHero).getByRole("button", { name: "Back to Title" })).toBeInTheDocument();
    expect(within(landingHero).getByRole("button", { name: "Start Match" })).toBeInTheDocument();
    expect(within(landingHero).getByLabelText("AI Pace")).toHaveValue("0.85");
    expect(within(landingHero).getByLabelText("Camera POV")).toHaveValue(
      CAMERA_CONFIG.MODES.BROADCAST_WIDE
    );
    expect(document.querySelector(".overlay")).not.toBeInTheDocument();
  });

  test("returns from the setup menu back to the Goal Rush title screen without starting", () => {
    render(<App />);
    openMatchSetup();

    fireEvent.click(screen.getByRole("button", { name: "Back to Title" }));

    const landingHero = screen.getByTestId("landing-hero");
    expect(within(landingHero).getByRole("button", { name: "Press Start" })).toBeInTheDocument();
    expect(within(landingHero).getByRole("button", { name: "Match Setup" })).toBeInTheDocument();
    expect(screen.queryByTestId("landing-menu-body")).not.toBeInTheDocument();
    expect(screen.getByText("Status: Idle")).toBeInTheDocument();
  });

  test("plays the landing sting only on explicit match start", () => {
    render(<App />);

    expect(mockAudioInstances).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Press Start" }));
    expect(mockAudioInstances).toHaveLength(1);
    expect(mockAudioInstances[0].play).toHaveBeenCalledTimes(1);
  });

  test("keeps the landing sting muted when start sound is disabled", () => {
    render(<App />);

    openMatchSetup();
    fireEvent.click(screen.getByLabelText("Start Sound"));
    fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
    expect(mockAudioInstances).toHaveLength(0);
  });

  test("allows switching between player and ball control targets", () => {
    render(<App />);
    openMatchSetup();

    const playerControlButton = screen.getByRole("button", { name: "Control Player" });
    const ballControlButton = screen.getByRole("button", { name: "Control Ball" });

    expect(playerControlButton).toHaveAttribute("aria-pressed", "true");
    expect(ballControlButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("shot-meter")).not.toBeInTheDocument();

    fireEvent.click(ballControlButton);

    expect(playerControlButton).toHaveAttribute("aria-pressed", "false");
    expect(ballControlButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("shot-meter")).not.toBeInTheDocument();
  });

  test("shows six soccer camera POV options in the menu", () => {
    render(<App />);
    openMatchSetup();

    const freeRoamButton = screen.getByRole("button", { name: "Free Roam" });
    expect(screen.getByRole("button", { name: "Broadcast Wide" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(freeRoamButton);

    expect(freeRoamButton).toHaveAttribute("aria-pressed", "true");
  });

  test("shows movement mapping select with Auto default", () => {
    render(<App />);

    openMatchSetup();
    const mappingSelect = screen.getByLabelText("Movement Mapping");
    expect(mappingSelect).toHaveValue("auto");
  });

  test("uses clickable difficulty cards and keeps readability labels", () => {
    render(<App />);
    openMatchSetup();

    expect(screen.getByRole("button", { name: /^Normal/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Hard/i }));
    expect(screen.getByRole("button", { name: /^Hard/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Difficulty")).toHaveValue("hard");
  });

  test("shows advanced options when the match setup panel opens", () => {
    render(<App />);

    expect(screen.queryByLabelText("AI Pace")).not.toBeInTheDocument();
    openMatchSetup();
    expect(screen.getByLabelText("AI Pace")).toHaveValue("0.85");
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByLabelText("Start Sound")).toBeChecked();
  });

  test("queues and clears a tackle command with the F hotkey", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-opponent-possession"));
    fireEvent.keyDown(window, { key: "f" });

    expect(screen.getByTestId("tackle-command").textContent).toMatch(/^tackle-player_one-/);

    fireEvent.click(screen.getByTestId("resolve-tackle"));
    expect(screen.getByTestId("tackle-command")).toHaveTextContent("");
  });

  test("requires focus to leave editable controls before the F tackle hotkey can queue", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-opponent-possession"));

    const optionsButton = screen.getByRole("button", { name: "Options" });
    fireEvent.click(optionsButton);

    const aiPaceSlider = screen.getByLabelText("AI Pace");
    aiPaceSlider.focus();
    expect(aiPaceSlider).toHaveFocus();

    fireEvent.keyDown(window, { key: "f" });
    expect(screen.getByTestId("tackle-command")).toHaveTextContent("");

    fireEvent.blur(aiPaceSlider);
    optionsButton.focus();
    expect(optionsButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "f" });
    expect(screen.getByTestId("tackle-command").textContent).toMatch(/^tackle-player_one-/);

    fireEvent.click(screen.getByTestId("resolve-tackle"));
    expect(screen.getByTestId("tackle-command")).toHaveTextContent("");
  });

  test("supports camera hotkeys for cycle and direct slot jump", () => {
    render(<App />);

    openMatchSetup();
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

  test("disables Camera POV select while replay is playing", async () => {
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

    openMatchSetup();
    const povSelect = screen.getByLabelText("Camera POV");
    await waitFor(() => {
      expect(povSelect).toBeDisabled();
      expect(latestCameraDirectorProps?.mode).toBe(CAMERA_CONFIG.MODES.REPLAY);
    });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.BROADCAST_WIDE);
  });

  test("ignores camera hotkeys while replay is playing", async () => {
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

    openMatchSetup();
    const povSelect = screen.getByLabelText("Camera POV");
    await waitFor(() => {
      expect(povSelect).toBeDisabled();
      expect(latestCameraDirectorProps?.mode).toBe(CAMERA_CONFIG.MODES.REPLAY);
    });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.BROADCAST_WIDE);

    fireEvent.keyDown(window, { key: "e" });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.BROADCAST_WIDE);

    fireEvent.keyDown(window, { key: "4" });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.BROADCAST_WIDE);
    expect(latestCameraDirectorProps?.mode).toBe(CAMERA_CONFIG.MODES.REPLAY);
  });

  test("starts match into intro and can skip to in-play controls", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Press Start" }));

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

    expect(screen.queryByTestId("score-team-one")).not.toBeInTheDocument();
    expect(screen.getByText("Status: Idle")).toBeInTheDocument();
    expect(screen.getByTestId("landing-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("broadcast-scoreboard")).not.toBeInTheDocument();
    expect(document.querySelector(".overlay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("replay-state")).not.toBeInTheDocument();
  });

  test("forces replay camera mode and restores the saved POV after replay ends", async () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    const povSelect = screen.getByLabelText("Camera POV");
    fireEvent.change(povSelect, { target: { value: CAMERA_CONFIG.MODES.FREE_ROAM } });

    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);
    expect(latestCameraDirectorProps?.mode).toBe(CAMERA_CONFIG.MODES.FREE_ROAM);

    seedReplayBuffer();
    fireEvent.click(screen.getByTestId("goal-teamOne"));
    syncReplayDirector(12_000);

    await waitFor(() => {
      expect(screen.getByText(/Status: Goal Scored \| Replay/i)).toBeInTheDocument();
      expect(povSelect).toBeDisabled();
      expect(latestCameraDirectorProps?.mode).toBe(CAMERA_CONFIG.MODES.REPLAY);
    });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);

    syncReplayDirector(13_000);

    await waitFor(() => {
      expect(screen.getByText(/Status: (Kickoff|In Play)/i)).toBeInTheDocument();
      expect(povSelect).toBeEnabled();
      expect(latestCameraDirectorProps?.mode).toBe(CAMERA_CONFIG.MODES.FREE_ROAM);
    });
    expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);
  });

  test("restart clears pending team two cpu commands and attack memory", () => {
    render(<App />);
    startAndSkipIntro();

    primeCpuAutomationState();
    expect(screen.getByTestId("ball-action-command")).toHaveTextContent("cpu-shot-opponent_one-seeded");

    fireEvent.click(screen.getByRole("button", { name: "Restart Match" }));

    expect(screen.queryByTestId("ball-action-command")).not.toBeInTheDocument();
    expect(screen.getByText("Status: Idle")).toBeInTheDocument();
    expect(latestOutfieldAiProps.teamAttackMemoryRef.current.teamTwo).toMatchObject({
      possessionStartMs: null,
      ballZone: "midfield",
      actionLocks: {},
    });
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

  test("keeps outfield control when the Team One keeper gains possession", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-possession-player-two"));
    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player Two");

    fireEvent.click(screen.getByTestId("mock-keeper-possession"));
    expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player Two");
  });

  test("repairs an invalid keeper active player back to a Team One outfielder", async () => {
    window.__SOCCER_E2E__ = true;

    render(<App />);
    startAndSkipIntro();

    await waitFor(() => {
      expect(window.__SOCCER_TEST_API__).toBeTruthy();
    });

    act(() => {
      window.__SOCCER_TEST_API__.setActivePlayerId("keeper-team-one");
    });

    fireEvent.click(screen.getByTestId("mock-keeper-possession"));

    await waitFor(() => {
      expect(screen.getByTestId("active-player-label")).toHaveTextContent("Player One");
    });
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

  test("C queues a lofted clear for the active Team One carrier", () => {
    render(<App />);
    startAndSkipIntro();

    fireEvent.click(screen.getByTestId("mock-possession"));
    fireEvent.keyDown(window, { key: "c" });

    expect(screen.getByTestId("ball-action-command").textContent).toMatch(/^lob-clear-player_one-/);
  });

  test("keeper possession stages a two-second keeper punt reset before launching", async () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();

      fireEvent.click(screen.getByTestId("mock-keeper-possession"));
      await act(async () => {});
      expect(screen.getByText(/Status: Restart/i)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(GOALKEEPER_CONFIG.RESTART_HOLD_MS + 40);
      });

      expect(screen.getByTestId("ball-action-command").textContent).toMatch(
        /^keeper_punt-keeper-team-one-/
      );

      fireEvent.click(screen.getByTestId("resolve-ball-action"));
      expect(screen.getByText("Status: In Play")).toBeInTheDocument();
      expect(screen.getByTestId("event-ticker")).toHaveTextContent("Brazil keeper punt");
    } finally {
      vi.useRealTimers();
    }
  });

  test("sideline exits stage a throw-in restart for the non-touching team", () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();

      fireEvent.click(screen.getByTestId("mock-out-throw-in"));
      expect(screen.getByText("Status: Restart")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(321);
      });

      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"type":"throw_in"');
      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"teamId":"teamTwo"');
      expect(screen.getByTestId("ball-action-command").textContent).toMatch(
        /^throw_in-opponent_one-opponent_two-/
      );

      fireEvent.click(screen.getByTestId("resolve-ball-action"));
      expect(screen.getByText("Status: In Play")).toBeInTheDocument();
      expect(screen.getByTestId("event-ticker")).toHaveTextContent("Argentina throw-in");
    } finally {
      vi.useRealTimers();
    }
  });

  test("goal-line exits stage a goal kick for the defending team", () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();

      fireEvent.click(screen.getByTestId("mock-out-goal-kick"));

      act(() => {
        vi.advanceTimersByTime(321);
      });

      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"type":"goal_kick"');
      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"teamId":"teamOne"');
      expect(screen.getByTestId("ball-action-command").textContent).toMatch(
        /^goal_kick-player_one-player_two-/
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("goal-line exits stage a corner for the attacking team when defenders touch last", () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();

      fireEvent.click(screen.getByTestId("mock-out-corner"));

      act(() => {
        vi.advanceTimersByTime(321);
      });

      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"type":"corner_kick"');
      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"teamId":"teamOne"');
      expect(screen.getByTestId("ball-action-command").textContent).toMatch(
        /^corner_kick-player_one-player_two-/
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("halftime flips sides, swaps goal ownership, and gives the second-half kickoff to Team Two", () => {
    vi.useFakeTimers();

    try {
      window.__SOCCER_E2E__ = true;
      render(<App />);
      startAndSkipIntro();
      autoResolveKickoffCommands = false;
      expect(window.__SOCCER_TEST_API__).toBeTruthy();

      const negativeGoalBefore = screen
        .getAllByRole("button")
        .find((button) => button.dataset.goalSide === "negative-z");
      const positiveGoalBefore = screen
        .getAllByRole("button")
        .find((button) => button.dataset.goalSide === "positive-z");

      expect(negativeGoalBefore).toHaveAttribute("data-goal-id", "teamOne");
      expect(positiveGoalBefore).toHaveAttribute("data-goal-id", "teamTwo");

      act(() => {
        vi.advanceTimersByTime((MATCH_DURATION_SECONDS / 2) * 1000);
      });

      expect(screen.getByText("Status: Kickoff")).toBeInTheDocument();
      expect(screen.getByText("HALF-TIME")).toBeInTheDocument();
      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"teamId":"teamTwo"');
      expect(screen.getByTestId("kickoff-setup")).toHaveTextContent('"takerId":"opponent_one"');

      const halftimeSnapshot = window.__SOCCER_TEST_API__.getSnapshot();
      expect(halftimeSnapshot.currentHalf).toBe(2);
      expect(halftimeSnapshot.teamAttackDirections).toEqual({
        teamOne: 1,
        teamTwo: -1,
      });
      expect(halftimeSnapshot.goalAssignments).toEqual({
        negativeZ: "teamTwo",
        positiveZ: "teamOne",
      });

      expect(getMockPlayer("player_one")).toHaveAttribute(
        "data-position",
        JSON.stringify([-6, 0, -22])
      );
      expect(getMockKeeper("keeper-team-one")).toHaveAttribute(
        "data-position",
        JSON.stringify([0, 0, -72.5])
      );

      const negativeGoalAfter = screen
        .getAllByRole("button")
        .find((button) => button.dataset.goalSide === "negative-z");
      const positiveGoalAfter = screen
        .getAllByRole("button")
        .find((button) => button.dataset.goalSide === "positive-z");

      expect(negativeGoalAfter).toHaveAttribute("data-goal-id", "teamTwo");
      expect(positiveGoalAfter).toHaveAttribute("data-goal-id", "teamOne");
    } finally {
      vi.useRealTimers();
    }
  });

  test("physical goal-side scoring shows the correct team text after halftime", async () => {
    window.__SOCCER_E2E__ = true;
    render(<App />);
    startAndSkipIntro();

    await waitFor(() => {
      expect(window.__SOCCER_TEST_API__).toBeTruthy();
    });

    act(() => {
      window.__SOCCER_TEST_API__.setTimeLeft(60);
    });

    await waitFor(() => {
      const snapshot = window.__SOCCER_TEST_API__.getSnapshot();
      expect(snapshot.currentHalf).toBe(2);
      expect(snapshot.goalAssignments.negativeZ).toBe("teamTwo");
      expect(snapshot.gameState).toBe("in_play");
    });

    act(() => {
      window.__SOCCER_TEST_API__.triggerPhysicalGoal("negativeZ");
    });

    expect(screen.getByTestId("score-team-one")).toHaveTextContent("0");
    expect(screen.getByTestId("score-team-two")).toHaveTextContent("1");
    expect(screen.getByText("ARGENTINA GOAL")).toBeInTheDocument();
    expect(screen.getByTestId("event-ticker")).toHaveTextContent("Argentina goal");
  });

  test("full time shows the end card, keeps the backup scoreboard visible, and locks camera controls", () => {
    vi.useFakeTimers();

    try {
      window.__SOCCER_E2E__ = true;
      render(<App />);
      startAndSkipIntro();
      expect(window.__SOCCER_TEST_API__).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Options" }));
      const povSelect = screen.getByLabelText("Camera POV");
      fireEvent.change(povSelect, { target: { value: CAMERA_CONFIG.MODES.FREE_ROAM } });

      act(() => {
        window.__SOCCER_TEST_API__.setTimeLeft(1);
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText("Status: Match Ended")).toBeInTheDocument();
      const fullTimePresentation = screen.getByTestId("full-time-presentation");
      const fullTimeCard = screen.getByTestId("full-time-end-card");
      expect(fullTimePresentation).toBeInTheDocument();
      expect(fullTimeCard).toBeInTheDocument();
      expect(fullTimeCard).toHaveAttribute("data-layout", "screen-modal");
      expect(screen.getByTestId("canvas")).not.toContainElement(fullTimeCard);
      expect(screen.getByTestId("full-time-team-one-score")).toHaveTextContent("0");
      expect(screen.getByTestId("full-time-team-two-score")).toHaveTextContent("0");
      expect(screen.getByTestId("full-time-team-one-flag")).toBeInTheDocument();
      expect(screen.getByTestId("full-time-team-two-flag")).toBeInTheDocument();
      expect(screen.queryByTestId("watch-highlights-button")).not.toBeInTheDocument();
      expect(screen.getByTestId("broadcast-scoreboard")).toHaveAttribute(
        "data-presentation-mode",
        "backup"
      );
      expect(screen.getByTestId("broadcast-team-one-flag")).toBeInTheDocument();
      expect(screen.getByTestId("broadcast-team-two-flag")).toBeInTheDocument();
      expect(povSelect).toBeDisabled();
      fireEvent.keyDown(window, { key: "q" });
      expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);
      expect(latestCameraDirectorProps.mode).toBe(CAMERA_CONFIG.MODES.END_ORBIT);
      expect(latestOrbitControlsProps.enabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("full time can launch archived goal highlights and returns to the end card after playback", async () => {
    vi.useFakeTimers();

    try {
      window.__SOCCER_E2E__ = true;
      render(<App />);
      startAndSkipIntro();
      seedReplayBuffer();

      fireEvent.click(screen.getByTestId("goal-teamOne"));
      syncReplayDirector(12_000);
      expect(screen.getByTestId("replay-world-label")).toHaveTextContent("REPLAY");

      fireEvent.keyDown(window, { key: "r" });
      syncReplayDirector(12_001);

      act(() => {
        vi.advanceTimersByTime(KICKOFF_CONFIG.POST_GOAL_DELAY_MS);
      });

      act(() => {
        window.__SOCCER_TEST_API__.setTimeLeft(1);
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId("watch-highlights-button")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("watch-highlights-button"));

      expect(screen.queryByTestId("full-time-end-card")).not.toBeInTheDocument();
      expect(screen.getByTestId("replay-world-label")).toHaveTextContent("REPLAY");
      expect(screen.getByText("Goal 1 / 1")).toBeInTheDocument();

      syncReplayDirector(30_000);

      expect(screen.getByTestId("full-time-end-card")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("preserves the selected live POV through full time and restores it after restart", () => {
    vi.useFakeTimers();

    try {
      window.__SOCCER_E2E__ = true;
      render(<App />);
      startAndSkipIntro();
      expect(window.__SOCCER_TEST_API__).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Options" }));
      const povSelect = screen.getByLabelText("Camera POV");
      fireEvent.change(povSelect, { target: { value: CAMERA_CONFIG.MODES.FREE_ROAM } });
      expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);

      act(() => {
        window.__SOCCER_TEST_API__.setTimeLeft(1);
        vi.advanceTimersByTime(1000);
      });

      expect(povSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);
      expect(povSelect).toBeDisabled();
      expect(latestCameraDirectorProps.mode).toBe(CAMERA_CONFIG.MODES.END_ORBIT);

      fireEvent.click(screen.getByRole("button", { name: "Restart Match" }));
      expect(screen.getByText("Status: Idle")).toBeInTheDocument();
      expect(screen.getByTestId("landing-hero")).toBeInTheDocument();
      expect(latestCameraDirectorProps.mode).toBe(CAMERA_CONFIG.MODES.LANDING_HERO);

      openMatchSetup();
      const restartPovSelect = screen.getByLabelText("Camera POV");
      expect(restartPovSelect).toHaveValue(CAMERA_CONFIG.MODES.FREE_ROAM);
      expect(restartPovSelect).toBeEnabled();
      expect(latestCameraDirectorProps.mode).toBe(CAMERA_CONFIG.MODES.LANDING_HERO);

      fireEvent.click(screen.getByRole("button", { name: "Start Match" }));
      expect(screen.getByText("Status: Pre-match Intro")).toBeInTheDocument();
      expect(latestCameraDirectorProps.mode).toBe(CAMERA_CONFIG.MODES.FREE_ROAM);

      fireEvent.click(screen.getByRole("button", { name: "Skip Intro" }));
      expect(screen.getByText("Status: In Play")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Options" }));
      expect(screen.getByLabelText("Camera POV")).toBeEnabled();
      expect(latestCameraDirectorProps.mode).toBe(CAMERA_CONFIG.MODES.FREE_ROAM);
      expect(latestOrbitControlsProps.enabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("waits for goal replay to finish before resetting the field", () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();
      seedReplayBuffer();

      const playerOneSpawnPosition = JSON.stringify(PLAYER_PROFILES.player_one.startPosition);
      fireEvent.click(screen.getByRole("button", { name: "Options" }));
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

  test("replay start and kickoff clear stale team two cpu automation", () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startAndSkipIntro();
      seedReplayBuffer();
      autoResolveKickoffCommands = false;

      fireEvent.click(screen.getByTestId("goal-teamOne"));
      primeCpuAutomationState();
      expect(screen.getByTestId("ball-action-command")).toHaveTextContent("cpu-shot-opponent_one-seeded");

      syncReplayDirector(12_000);
      expect(screen.getByText(/Status: Goal Scored \| Replay/i)).toBeInTheDocument();
      expect(screen.getByTestId("ball-action-command")).toHaveTextContent("");
      expect(latestOutfieldAiProps.teamAttackMemoryRef.current.teamTwo.actionLocks).toEqual({});

      primeCpuAutomationState();
      expect(screen.getByTestId("ball-action-command")).toHaveTextContent("cpu-shot-opponent_one-seeded");

      syncReplayDirector(13_000);
      act(() => {
        vi.advanceTimersByTime(KICKOFF_CONFIG.POST_GOAL_DELAY_MS);
      });

      expect(screen.getByText("Status: Kickoff")).toBeInTheDocument();
      expect(screen.getByTestId("ball-action-command").textContent).toMatch(/^kickoff-/);
      expect(latestOutfieldAiProps.teamAttackMemoryRef.current.teamTwo.actionLocks).toEqual({});
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
      expect(screen.getByTestId("skip-replay-button")).toHaveTextContent("Skip Replay (R)");

      fireEvent.click(screen.getByTestId("skip-replay-button"));

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
