import { expect, test } from "@playwright/test";
import { PLAYER_PROFILES } from "../src/config/gameConfig";

type TeamGoalId = "teamOne" | "teamTwo";

type MatchSnapshot = {
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
  lastKickoff: {
    id: string;
    commandId: string | null;
    teamId: string;
    takerId: string;
    receiverId: string;
    status: string;
  } | null;
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

test("shows expanded camera options and supports camera hotkeys", async ({ page }) => {
  await page.goto("/");

  const povSelect = page.getByLabel("Camera POV");
  await expect(povSelect).toHaveValue("broadcast-wide");

  const optionLabels = await povSelect.locator("option").allTextContents();
  expect(optionLabels).toEqual([
    "Broadcast Wide",
    "Player Chase",
    "Behind Player (West of Ball)",
    "Attacking Third",
    "Goal Line",
    "Free Roam",
  ]);

  await page.keyboard.press("KeyE");
  await expect(povSelect).toHaveValue("player-chase");

  await page.keyboard.press("Digit4");
  await expect(povSelect).toHaveValue("attacking-third");

  await page.keyboard.press("Digit6");
  await expect(povSelect).toHaveValue("free-roam");
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
