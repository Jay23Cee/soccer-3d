import { expect, test } from "@playwright/test";

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
