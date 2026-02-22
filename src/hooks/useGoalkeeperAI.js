import { useEffect } from "react";

export default function useGoalkeeperAI({
  enabled,
  ballSnapshot,
  difficulty,
  goalkeeperConfig,
  updateGoalkeeperController,
  setGoalkeeperState,
  setExternalBallCommand,
  goalkeeperLastUpdateAtRef,
  nowMs,
}) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const timer = setInterval(() => {
      if (!ballSnapshot) {
        return;
      }

      const now = nowMs();
      const deltaSeconds =
        goalkeeperLastUpdateAtRef.current > 0
          ? Math.max(0.01, (now - goalkeeperLastUpdateAtRef.current) / 1000)
          : goalkeeperConfig.UPDATE_INTERVAL_MS / 1000;
      goalkeeperLastUpdateAtRef.current = now;

      setGoalkeeperState((currentState) => {
        const nextTeamOne = updateGoalkeeperController({
          nowMs: now,
          deltaSeconds,
          difficulty,
          keeperState: currentState.teamOne,
          ballSnapshot,
        });
        const nextTeamTwo = updateGoalkeeperController({
          nowMs: now,
          deltaSeconds,
          difficulty,
          keeperState: currentState.teamTwo,
          ballSnapshot,
        });

        const saveKeeper = nextTeamOne.saveRequested
          ? nextTeamOne
          : nextTeamTwo.saveRequested
            ? nextTeamTwo
            : null;

        if (saveKeeper?.distributeImpulse) {
          setExternalBallCommand({
            id: `keeper-save-${saveKeeper.teamId}-${now}`,
            type: "velocity",
            vector: saveKeeper.distributeImpulse.map((value, index) =>
              index === 1 ? value * 10 : value
            ),
            event: {
              type: "save",
              teamId: saveKeeper.teamId,
              releasedAtMs: now,
            },
          });
        }

        return {
          teamOne: nextTeamOne,
          teamTwo: nextTeamTwo,
        };
      });
    }, goalkeeperConfig.UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [
    ballSnapshot,
    difficulty,
    enabled,
    goalkeeperConfig.UPDATE_INTERVAL_MS,
    goalkeeperLastUpdateAtRef,
    nowMs,
    setExternalBallCommand,
    setGoalkeeperState,
    updateGoalkeeperController,
  ]);
}
