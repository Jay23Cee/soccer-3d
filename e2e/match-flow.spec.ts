import { expect, test } from "@playwright/test";
import { PLAYER_PROFILES } from "../src/config/gameConfig";

type TeamGoalId = "teamOne" | "teamTwo";
type GoalSide = "negativeZ" | "positiveZ";

type MatchSnapshot = {
  currentHalf: number;
  teamAttackDirections: {
    teamOne: number;
    teamTwo: number;
  };
  goalAssignments: {
    negativeZ: TeamGoalId;
    positiveZ: TeamGoalId;
  };
  gameState: string;
  replayState: {
    mode: string;
    isPlaying: boolean;
    canSkip: boolean;
    eventType: string | null;
    eventId: string | null;
    currentPlaybackIndex: number;
    totalPlaybackFrames: number;
  };
  score: {
    teamOne: number;
    teamTwo: number;
  };
  activePlayerId: string;
  possessionState: {
    teamId: string;
    playerId: string;
  } | null;
  ballSnapshot: {
    timestampMs: number;
    position: number[];
    velocity: number[];
    mode: string;
    possession: {
      teamId: string;
      playerId: string;
    } | null;
  } | null;
  pendingBallAction: {
    id: string;
    type: string;
    actorId: string;
    targetPlayerId: string | null;
  } | null;
  pendingRestart: {
    id: string;
    type: string;
    teamId: string;
    takerId: string;
    receiverId: string;
    spotPosition: number[];
    receiverPosition: number[] | null;
    delayMs: number;
    commandId: string | null;
    status: string;
    progress?: number;
  } | null;
  eventTimeline: Array<{
    id: string;
    type: string;
    teamId: string | null;
  }>;
  lastKickoff: {
    id: string;
    commandId: string | null;
    teamId: string;
    takerId: string;
    receiverId: string;
    status: string;
  } | null;
  outfieldAiStates: Record<
    string,
    {
      mode: string;
      assignment: string | null;
      targetPlayerId: string | null;
      phase: string;
      targetPosition: number[] | null;
    }
  >;
  playerStates: Record<
    string,
    {
      position: number[];
      rotation: number[];
    }
  >;
};

async function enableSoccerE2EHarness(page) {
  await page.addInitScript(() => {
    const soccerWindow = window as Window & { __SOCCER_E2E__?: boolean };
    soccerWindow.__SOCCER_E2E__ = true;
  });
}

async function waitForSoccerTestApi(page) {
  await page.waitForFunction(() => {
    const soccerWindow = window as Window & { __SOCCER_TEST_API__?: unknown };
    return Boolean(soccerWindow.__SOCCER_TEST_API__);
  });
}

async function getMatchSnapshot(page): Promise<MatchSnapshot> {
  return page.evaluate(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    return soccerWindow.__SOCCER_TEST_API__.getSnapshot();
  });
}

async function triggerGoal(page, goalId: TeamGoalId) {
  await page.evaluate((nextGoalId) => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        triggerGoal: (goalId: TeamGoalId) => void;
      };
    };
    soccerWindow.__SOCCER_TEST_API__.triggerGoal(nextGoalId);
  }, goalId);
}

async function triggerPhysicalGoal(page, goalSide: GoalSide) {
  await page.evaluate((nextGoalSide) => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        triggerPhysicalGoal: (goalSide: GoalSide) => void;
      };
    };
    soccerWindow.__SOCCER_TEST_API__.triggerPhysicalGoal(nextGoalSide);
  }, goalSide);
}

async function setMatchTimeLeft(page, seconds: number) {
  await page.evaluate((nextTimeLeft) => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        setTimeLeft: (seconds: number) => void;
      };
    };
    soccerWindow.__SOCCER_TEST_API__.setTimeLeft(nextTimeLeft);
  }, seconds);
}

async function stageScenario(
  page,
  scenarioName:
    | "teamTwoAttack"
    | "teamTwoPress"
    | "teamTwoTackle"
    | "teamOneCarry"
    | "teamOneKeeperCatch"
) {
  await page.evaluate((nextScenarioName) => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        stageScenario: (scenarioName: string) => void;
      };
    };
    soccerWindow.__SOCCER_TEST_API__.stageScenario(nextScenarioName);
  }, scenarioName);
}

async function triggerOutOfBounds(
  page,
  outOfBoundsSnapshot: {
    position: number[];
    velocity?: number[];
    mode?: string;
    possession?: { teamId: string; playerId: string } | null;
    lastTouch?: { teamId: string; playerId: string } | null;
  }
) {
  await page.evaluate((nextOutOfBoundsSnapshot) => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        triggerOutOfBounds: (snapshot: typeof nextOutOfBoundsSnapshot) => void;
      };
    };
    soccerWindow.__SOCCER_TEST_API__.triggerOutOfBounds(nextOutOfBoundsSnapshot);
  }, outOfBoundsSnapshot);
}

async function startMatchAndSkipIntro(page) {
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByText("Status: Pre-match Intro")).toBeVisible({ timeout: 15_000 });

  const skipIntroButton = page.getByRole("button", { name: "Skip Intro" });
  const canSkip = await skipIntroButton
    .isVisible({ timeout: 4_000 })
    .catch(() => false);
  if (canSkip) {
    await skipIntroButton.click({ timeout: 2_000 }).catch(() => {});
  }

  await expect(page.getByText("Status: In Play")).toBeVisible({ timeout: 20_000 });
}

async function openOptionsPanel(page) {
  const optionsButton = page.getByRole("button", { name: "Options" });
  const isExpanded = await optionsButton.getAttribute("aria-expanded");
  if (isExpanded !== "true") {
    await optionsButton.click();
  }
}

async function setRangeControlValue(page, label: string, value: number) {
  await page.getByLabel(label).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function blurEditableActiveElement(page) {
  await page.evaluate(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return;
    }

    const tagName = activeElement.tagName.toLowerCase();
    if (tagName === "input" || tagName === "select" || tagName === "textarea") {
      activeElement.blur();
    }
  });
}

test("starts a match and skips intro into active play", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Soccer 3D")).toBeVisible();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByText("Status: Pre-match Intro")).toBeVisible({ timeout: 15_000 });

  const skipIntroButton = page.getByRole("button", { name: "Skip Intro" });
  const canSkip = await skipIntroButton
    .isVisible({ timeout: 4_000 })
    .catch(() => false);
  if (canSkip) {
    await skipIntroButton.click({ timeout: 2_000 }).catch(() => {});
  }

  await expect(page.getByText("Status: In Play")).toBeVisible({ timeout: 20_000 });
});

test("supports control target switching from player to ball", async ({ page }) => {
  await page.goto("/");

  const playerControl = page.getByRole("button", { name: "Control Player" });
  const ballControl = page.getByRole("button", { name: "Control Ball" });

  await expect(playerControl).toHaveAttribute("aria-pressed", "true");
  await expect(ballControl).toHaveAttribute("aria-pressed", "false");

  await ballControl.click();

  await expect(playerControl).toHaveAttribute("aria-pressed", "false");
  await expect(ballControl).toHaveAttribute("aria-pressed", "true");
});

test("uses the clickable pre-match hub selections when the match starts", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Hard" }).click();
  await page.getByRole("button", { name: "Attacking Third" }).click();
  await page.getByRole("button", { name: "Control Ball" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByText("Status: Pre-match Intro")).toBeVisible({ timeout: 15_000 });

  const skipIntroButton = page.getByRole("button", { name: "Skip Intro" });
  const canSkip = await skipIntroButton
    .isVisible({ timeout: 4_000 })
    .catch(() => false);
  if (canSkip) {
    await skipIntroButton.click({ timeout: 2_000 }).catch(() => {});
  }

  await expect(page.getByText("Status: In Play")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Control Ball" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await openOptionsPanel(page);
  await expect(page.getByLabel("Difficulty")).toHaveValue("hard");
  await expect(page.getByLabel("Camera POV")).toHaveValue("attacking-third");
});

test("shows clickable camera options and supports camera hotkeys", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Broadcast Wide" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: "Free Roam" }).click();
  await expect(page.getByRole("button", { name: "Free Roam" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.keyboard.press("KeyE");
  await expect(page.getByRole("button", { name: "Broadcast Wide" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.keyboard.press("Digit4");
  await expect(page.getByRole("button", { name: "Attacking Third" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.keyboard.press("Digit6");
  await expect(page.getByRole("button", { name: "Free Roam" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("staged Team One possession lets C queue a lofted clear", async ({ page }) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await stageScenario(page, "teamOneCarry");

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return (
      snapshot.gameState === "in_play" &&
      snapshot.possessionState?.teamId === "teamOne" &&
      snapshot.possessionState?.playerId === "player_one"
    );
  });

  await page.keyboard.press("KeyC");

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return (
      snapshot.possessionState === null &&
      snapshot.ballSnapshot?.mode === "released" &&
      (snapshot.ballSnapshot?.velocity?.[1] || 0) > 2
    );
  });
});

test("keeper catches stage a two-second restart before the auto punt", async ({ page }) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await stageScenario(page, "teamOneKeeperCatch");

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return (
      snapshot.gameState === "restart" &&
      snapshot.pendingRestart?.type === "keeper_punt" &&
      snapshot.pendingRestart?.status === "staged"
    );
  });

  const stagedSnapshot = await getMatchSnapshot(page);
  expect(stagedSnapshot.pendingRestart?.teamId).toBe("teamOne");
  expect(stagedSnapshot.pendingRestart?.takerId).toBe("keeper-team-one");

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return (
      snapshot.gameState === "in_play" &&
      snapshot.eventTimeline.some(
        (event) => event.type === "keeper_punt" && event.teamId === "teamOne"
      )
    );
  }, undefined, { timeout: 4_000 });
});

test("keeps the soccer menu scrollable inside the overlay on short screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/");

  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByText("Status: Pre-match Intro")).toBeVisible({ timeout: 15_000 });

  const skipIntroButton = page.getByRole("button", { name: "Skip Intro" });
  const canSkip = await skipIntroButton
    .isVisible({ timeout: 4_000 })
    .catch(() => false);
  if (canSkip) {
    await skipIntroButton.click({ timeout: 2_000 }).catch(() => {});
  }

  await expect(page.getByText("Status: In Play")).toBeVisible({ timeout: 20_000 });
  await openOptionsPanel(page);

  const overlay = page.locator(".overlay");
  await overlay.evaluate((element) => {
    element.scrollTop = 0;
  });

  const startingMetrics = await overlay.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));

  expect(startingMetrics.scrollHeight).toBeGreaterThan(startingMetrics.clientHeight);
  expect(startingMetrics.scrollTop).toBe(0);

  await overlay.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  await expect
    .poll(async () => overlay.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await expect(page.getByRole("button", { name: "Restart Match" })).toBeVisible();
  await page.getByRole("button", { name: "Restart Match" }).click();
  await expect(page.getByText("Status: Pre-match Intro")).toBeVisible({ timeout: 15_000 });

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("replays a goal, resets the field, and hands kickoff to the conceding team", async ({ page }) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);

  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByText("Status: Pre-match Intro")).toBeVisible({ timeout: 15_000 });

  const skipIntroButton = page.getByRole("button", { name: "Skip Intro" });
  const canSkip = await skipIntroButton
    .isVisible({ timeout: 4_000 })
    .catch(() => false);
  if (canSkip) {
    await skipIntroButton.click({ timeout: 2_000 }).catch(() => {});
  }

  await expect(page.getByText("Status: In Play")).toBeVisible({ timeout: 20_000 });
  await openOptionsPanel(page);
  await page.getByLabel("Movement Mapping").selectOption("world");

  const initialSnapshot = await getMatchSnapshot(page);
  const playerOneSpawnPosition = PLAYER_PROFILES.player_one.startPosition;
  const serializedPlayerOneSpawnPosition = JSON.stringify(playerOneSpawnPosition);
  expect(initialSnapshot.activePlayerId).toBe("player_one");

  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.up("ArrowUp");

  await page.waitForFunction((spawnPosition) => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    return JSON.stringify(soccerWindow.__SOCCER_TEST_API__.getSnapshot().playerStates.player_one.position) !== spawnPosition;
  }, serializedPlayerOneSpawnPosition);

  await triggerGoal(page, "teamOne");

  await expect(page.getByTestId("score-team-one")).toHaveText("1");
  await expect(page.locator(".status-label")).toHaveText("Status: Goal Scored");

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return snapshot.gameState === "goal_scored" && snapshot.replayState.isPlaying === true;
  });

  await expect(page.locator(".status-label")).toHaveText("Status: Goal Scored | Replay");
  await expect(page.getByTestId("replay-state")).toContainText("goal");

  await page.keyboard.press("KeyR");

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return (
      snapshot.lastKickoff?.teamId === "teamTwo" &&
      snapshot.lastKickoff?.takerId === "opponent_one" &&
      snapshot.lastKickoff?.status === "completed"
    );
  });

  await page.waitForFunction((spawnPosition) => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    const playerOnePosition = snapshot.playerStates.player_one.position;
    const isAtSpawn = playerOnePosition.every(
      (value, index) => Math.abs(value - spawnPosition[index]) <= 0.05
    );
    return (
      snapshot.gameState === "in_play" &&
      snapshot.replayState.isPlaying === false &&
      isAtSpawn
    );
  }, playerOneSpawnPosition);

  const finalSnapshot = await getMatchSnapshot(page);
  expect(finalSnapshot.activePlayerId).toBe("player_one");
  expect(finalSnapshot.playerStates.player_one.position).toEqual(playerOneSpawnPosition);
  await expect(page.getByText("Status: In Play")).toBeVisible();
});

test("halftime auto-resets, swaps directions, and gives the second-half kickoff to Team Two", async ({
  page,
}) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  const firstHalfSnapshot = await getMatchSnapshot(page);
  expect(firstHalfSnapshot.currentHalf).toBe(1);
  expect(firstHalfSnapshot.teamAttackDirections).toEqual({
    teamOne: -1,
    teamTwo: 1,
  });
  expect(firstHalfSnapshot.goalAssignments).toEqual({
    negativeZ: "teamOne",
    positiveZ: "teamTwo",
  });

  await setMatchTimeLeft(page, 60);

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return (
      snapshot.currentHalf === 2 &&
      snapshot.teamAttackDirections.teamOne === 1 &&
      snapshot.teamAttackDirections.teamTwo === -1 &&
      snapshot.goalAssignments.negativeZ === "teamTwo" &&
      snapshot.goalAssignments.positiveZ === "teamOne" &&
      snapshot.lastKickoff?.teamId === "teamTwo"
    );
  });

  const halftimeSnapshot = await getMatchSnapshot(page);
  expect(halftimeSnapshot.playerStates.player_one.position[2]).toBeLessThan(0);
  expect(halftimeSnapshot.lastKickoff?.takerId).toBe("opponent_one");
});

test("a post-halftime physical positive-Z goal credits Team One after the side swap", async ({
  page,
}) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await setMatchTimeLeft(page, 60);

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return (
      snapshot.currentHalf === 2 &&
      snapshot.goalAssignments.positiveZ === "teamOne" &&
      snapshot.gameState === "in_play"
    );
  });

  await triggerPhysicalGoal(page, "positiveZ");

  await expect(page.getByTestId("score-team-one")).toHaveText("1");
  await expect(page.getByTestId("score-team-two")).toHaveText("0");
  await expect(page.locator(".match-event-banner")).toHaveText("BRAZIL GOAL");
  await expect(page.getByTestId("event-ticker")).toContainText("Brazil goal");
});

test("team two attack scenario creates a shot quickly from the staged attack", async ({
  page,
}) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await openOptionsPanel(page);
  await page.getByRole("button", { name: "Hard" }).click();
  await setRangeControlValue(page, "AI Pace", 1.15);
  await stageScenario(page, "teamTwoAttack");

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return snapshot.possessionState?.teamId === "teamTwo";
  });

  await page.waitForFunction(
    () => {
      const soccerWindow = window as Window & {
        __SOCCER_TEST_API__: {
          getSnapshot: () => MatchSnapshot;
        };
      };
      const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
      return (
        snapshot.pendingBallAction?.type === "shot" ||
        Object.values(snapshot.outfieldAiStates).some((state) => state.mode === "shoot")
      );
    },
    undefined,
    { timeout: 2_500 }
  );

  await page.waitForFunction(
    () => {
      const soccerWindow = window as Window & {
        __SOCCER_TEST_API__: {
          getSnapshot: () => MatchSnapshot;
        };
      };
      const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
      return snapshot.eventTimeline.some(
        (event) => event.type === "shot" && event.teamId === "teamTwo"
      );
    },
    undefined,
    { timeout: 4_000 }
  );

  const finalSnapshot = await getMatchSnapshot(page);
  expect(
    finalSnapshot.eventTimeline.some(
      (event) => event.type === "shot" && event.teamId === "teamTwo"
    )
  ).toBe(true);
});

test("team two press scenario closes down team one and forces a contest or turnover", async ({
  page,
}) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await openOptionsPanel(page);
  await page.getByRole("button", { name: "Hard" }).click();
  await setRangeControlValue(page, "AI Pace", 1.15);
  await stageScenario(page, "teamTwoPress");

  await page.waitForFunction(
    () => {
      const soccerWindow = window as Window & {
        __SOCCER_TEST_API__: {
          getSnapshot: () => MatchSnapshot;
        };
      };
      const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
      return snapshot.possessionState?.teamId === "teamOne";
    },
    undefined,
    { timeout: 2_000 }
  );

  await page.waitForFunction(
    () => {
      const soccerWindow = window as Window & {
        __SOCCER_TEST_API__: {
          getSnapshot: () => MatchSnapshot;
        };
      };
      const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
      const aiStates = Object.values(snapshot.outfieldAiStates);
      return (
        aiStates.some(
          (state) => state.assignment === "primary_press" && state.mode === "press"
        ) &&
        aiStates.some((state) => state.assignment === "secondary_cover")
      );
    },
    undefined,
    { timeout: 2_000 }
  );

  await page.waitForFunction(
    () => {
      const soccerWindow = window as Window & {
        __SOCCER_TEST_API__: {
          getSnapshot: () => MatchSnapshot;
        };
      };
      const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
      const aiStates = Object.values(snapshot.outfieldAiStates);
      return (
        snapshot.possessionState?.teamId === "teamTwo" ||
        (snapshot.ballSnapshot?.mode === "loose" &&
          aiStates.some((state) => state.phase === "press" || state.phase === "attack")) ||
        snapshot.eventTimeline.some(
          (event) => event.type === "possession" && event.teamId === "teamTwo"
        )
      );
    },
    undefined,
    { timeout: 6_000 }
  );

  const finalSnapshot = await getMatchSnapshot(page);
  expect(
    finalSnapshot.possessionState?.teamId === "teamTwo" ||
      finalSnapshot.ballSnapshot?.mode === "loose" ||
      finalSnapshot.eventTimeline.some(
        (event) => event.type === "possession" && event.teamId === "teamTwo"
      )
  ).toBe(true);
});

test("team two tackle scenario lets team one knock the ball loose with F", async ({ page }) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await openOptionsPanel(page);
  await page.getByRole("button", { name: "Easy" }).click();
  await setRangeControlValue(page, "AI Pace", 0.6);
  await blurEditableActiveElement(page);
  await stageScenario(page, "teamTwoTackle");

  await page.waitForFunction(
    () => {
      const soccerWindow = window as Window & {
        __SOCCER_TEST_API__: {
          getSnapshot: () => MatchSnapshot;
        };
      };
      const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
      return (
        snapshot.gameState === "in_play" &&
        snapshot.activePlayerId === "player_one" &&
        snapshot.possessionState?.teamId === "teamTwo" &&
        snapshot.possessionState?.playerId === "opponent_one" &&
        snapshot.playerStates.player_one.position &&
        snapshot.playerStates.opponent_one.position
      );
    },
    { timeout: 2_000 }
  );

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) {
          return false;
        }

        const tagName = activeElement.tagName.toLowerCase();
        return tagName === "input" || tagName === "select" || tagName === "textarea";
      })
    )
    .toBe(false);

  await page.keyboard.press("KeyF");

  await expect
    .poll(
      async () => {
        const snapshot = await getMatchSnapshot(page);
        return (
          snapshot.possessionState === null ||
          snapshot.ballSnapshot?.mode === "released" ||
          snapshot.ballSnapshot?.mode === "loose"
        );
      },
      {
        timeout: 4_000,
        intervals: [50, 100, 150, 250, 500],
      }
    )
    .toBe(true);
});

test("sideline out-of-bounds awards a throw-in to the other team and resumes play", async ({
  page,
}) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await triggerOutOfBounds(page, {
    position: [74, 1, 14],
    velocity: [0, 0, 0],
    mode: "released",
    possession: null,
    lastTouch: {
      teamId: "teamOne",
      playerId: "player_one",
    },
  });

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return snapshot.pendingRestart?.type === "throw_in";
  });

  const stagedRestart = await getMatchSnapshot(page);
  expect(stagedRestart.pendingRestart?.teamId).toBe("teamTwo");
  expect(["staged", "launched", "completed"]).toContain(stagedRestart.pendingRestart?.status);

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return (
      (snapshot.pendingRestart?.status === "completed" && snapshot.gameState === "in_play") ||
      (snapshot.gameState === "in_play" &&
        snapshot.eventTimeline.some((event) => event.type === "throw_in"))
    );
  });

  const finalSnapshot = await getMatchSnapshot(page);
  expect(finalSnapshot.eventTimeline.some((event) => event.type === "throw_in")).toBe(true);
});

test("goal-line exits classify as goal kicks for the defending team", async ({ page }) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await triggerOutOfBounds(page, {
    position: [8, 1, 88],
    velocity: [0, 0, 0],
    mode: "released",
    possession: null,
    lastTouch: {
      teamId: "teamTwo",
      playerId: "opponent_one",
    },
  });

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return snapshot.pendingRestart?.type === "goal_kick";
  });

  const snapshot = await getMatchSnapshot(page);
  expect(snapshot.pendingRestart?.teamId).toBe("teamOne");
  expect(snapshot.pendingRestart?.spotPosition[2]).toBeGreaterThan(0);
});

test("goal-line exits classify as corners when defenders touch last", async ({ page }) => {
  await enableSoccerE2EHarness(page);
  await page.goto("/");
  await waitForSoccerTestApi(page);
  await startMatchAndSkipIntro(page);

  await triggerOutOfBounds(page, {
    position: [-10, 1, -88],
    velocity: [0, 0, 0],
    mode: "released",
    possession: null,
    lastTouch: {
      teamId: "teamTwo",
      playerId: "opponent_one",
    },
  });

  await page.waitForFunction(() => {
    const soccerWindow = window as Window & {
      __SOCCER_TEST_API__: {
        getSnapshot: () => MatchSnapshot;
      };
    };
    const snapshot = soccerWindow.__SOCCER_TEST_API__.getSnapshot();
    return snapshot.pendingRestart?.type === "corner_kick";
  });

  const snapshot = await getMatchSnapshot(page);
  expect(snapshot.pendingRestart?.teamId).toBe("teamOne");
  expect(snapshot.pendingRestart?.spotPosition[0]).toBeLessThan(0);
  expect(snapshot.pendingRestart?.spotPosition[2]).toBeLessThan(0);
});
