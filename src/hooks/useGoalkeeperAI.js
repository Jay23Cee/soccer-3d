import { useEffect, useRef } from "react";

export default function useGoalkeeperAI({
  enabled,
  ballSnapshot,
  difficulty,
  aiPaceMultiplier,
  goalkeeperConfig,
  updateGoalkeeperController,
  setGoalkeeperState,
  setBallActionCommand,
  goalkeeperLastUpdateAtRef,
  nowMs,
}) {
  const ballSnapshotRef = useRef(ballSnapshot);

  useEffect(() => {
    ballSnapshotRef.current = ballSnapshot;
  }, [ballSnapshot]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const timer = setInterval(() => {
      const latestBallSnapshot = ballSnapshotRef.current;

      if (!latestBallSnapshot) {
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
          aiPaceMultiplier,
          keeperState: currentState.teamOne,
          ballSnapshot: latestBallSnapshot,
        });
        const nextTeamTwo = updateGoalkeeperController({
          nowMs: now,
          deltaSeconds,
          difficulty,
          aiPaceMultiplier,
          keeperState: currentState.teamTwo,
          ballSnapshot: latestBallSnapshot,
        });

        const distributingKeeper = nextTeamOne.saveRequested || nextTeamOne.distributionRequested
          ? nextTeamOne
          : nextTeamTwo.saveRequested || nextTeamTwo.distributionRequested
            ? nextTeamTwo
            : null;

        if (distributingKeeper?.distributeImpulse) {
          setBallActionCommand((currentCommand) =>
            currentCommand || {
              id: `keeper-save-${distributingKeeper.teamId}-${now}`,
              actorId: distributingKeeper.playerId,
              teamId: distributingKeeper.teamId,
              type: "clear",
              targetPlayerId: null,
              targetPosition: [
                distributingKeeper.teamId === "teamOne" ? 0 : 0,
                0,
                distributingKeeper.teamId === "teamOne" ? -18 : 18,
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
    aiPaceMultiplier,
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
