import { useEffect } from "react";

export default function useGoalkeeperAI({
  enabled,
  ballSnapshot,
  difficulty,
  goalkeeperConfig,
  updateGoalkeeperController,
  setGoalkeeperState,
  setBallActionCommand,
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
          setBallActionCommand((currentCommand) =>
            currentCommand || {
              id: `keeper-save-${saveKeeper.teamId}-${now}`,
              actorId: saveKeeper.playerId,
              teamId: saveKeeper.teamId,
              type: "clear",
              targetPlayerId: null,
              targetPosition: [
                saveKeeper.teamId === "teamOne" ? 0 : 0,
                0,
                saveKeeper.teamId === "teamOne" ? -18 : 18,
              ],
              power: 1.15,
            }
          );
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
    setBallActionCommand,
    setGoalkeeperState,
    updateGoalkeeperController,
  ]);
}
