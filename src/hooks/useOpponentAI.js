import { useEffect } from "react";

export default function useOpponentAI({
  enabled,
  ballSnapshot,
  difficulty,
  aiConfig,
  teamOnePlayerIds,
  teamTwoPlayerIds,
  teamIds,
  teamGoalTargets,
  createInitialOpponentState,
  getPlayerProfile,
  updateOpponentController,
  setPlayerStates,
  setOpponentAiStates,
  setExternalBallCommand,
  aiLastUpdateAtRef,
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
        aiLastUpdateAtRef.current > 0
          ? Math.max(0.01, (now - aiLastUpdateAtRef.current) / 1000)
          : aiConfig.UPDATE_INTERVAL_MS / 1000;
      aiLastUpdateAtRef.current = now;

      setPlayerStates((currentStates) => {
        const nextOpponentAiStates = {};
        let shotCommand = null;
        let nextStates = currentStates;
        let hasPlayerStateChange = false;

        teamTwoPlayerIds.forEach((opponentId) => {
          const opponentPlayer = currentStates[opponentId];
          if (!opponentPlayer) {
            nextOpponentAiStates[opponentId] = createInitialOpponentState(
              getPlayerProfile(opponentId).startPosition
            );
            return;
          }

          const nearestTeamOnePlayer = teamOnePlayerIds.map((playerId) => currentStates[playerId]).reduce(
            (closest, candidate) => {
              if (!candidate) {
                return closest;
              }
              if (!closest) {
                return candidate;
              }
              const candidateDistance = Math.hypot(
                opponentPlayer.position[0] - candidate.position[0],
                opponentPlayer.position[2] - candidate.position[2]
              );
              const closestDistance = Math.hypot(
                opponentPlayer.position[0] - closest.position[0],
                opponentPlayer.position[2] - closest.position[2]
              );
              return candidateDistance < closestDistance ? candidate : closest;
            },
            null
          );

          const nextAI = updateOpponentController({
            nowMs: now,
            deltaSeconds,
            difficulty,
            ballSnapshot,
            playerState: nearestTeamOnePlayer,
            opponentState: opponentPlayer,
            homePosition: getPlayerProfile(opponentId).startPosition,
            targetGoal: teamGoalTargets[teamIds.TEAM_TWO],
          });

          nextOpponentAiStates[opponentId] = nextAI;

          if (!shotCommand && nextAI.shootRequested && nextAI.shotVector) {
            shotCommand = {
              id: `ai-shot-${opponentId}-${now}`,
              type: "impulse",
              vector: [nextAI.shotVector[0] * 11, 1.8, nextAI.shotVector[2] * 11],
              event: {
                type: "shot",
                teamId: teamIds.TEAM_TWO,
                releasedAtMs: now,
              },
            };
          }

          const nextPosition = nextAI.nextPosition || opponentPlayer.position;
          const nextRotation = nextAI.nextRotation || opponentPlayer.rotation;
          if (!hasPlayerStateChange) {
            const positionChanged =
              !opponentPlayer.position ||
              Math.abs(opponentPlayer.position[0] - nextPosition[0]) > 0.0001 ||
              Math.abs(opponentPlayer.position[2] - nextPosition[2]) > 0.0001;
            const rotationChanged =
              !opponentPlayer.rotation ||
              Math.abs(opponentPlayer.rotation[1] - nextRotation[1]) > 0.0001;
            hasPlayerStateChange = positionChanged || rotationChanged;
          }

          if (hasPlayerStateChange) {
            if (nextStates === currentStates) {
              nextStates = { ...currentStates };
            }
            nextStates[opponentId] = {
              ...opponentPlayer,
              position: nextPosition,
              rotation: nextRotation,
            };
          }
        });

        setOpponentAiStates((current) => ({
          ...current,
          ...nextOpponentAiStates,
        }));

        if (shotCommand) {
          setExternalBallCommand(shotCommand);
        }

        return nextStates;
      });
    }, aiConfig.UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [
    aiConfig.UPDATE_INTERVAL_MS,
    aiLastUpdateAtRef,
    ballSnapshot,
    createInitialOpponentState,
    difficulty,
    enabled,
    getPlayerProfile,
    nowMs,
    setExternalBallCommand,
    setOpponentAiStates,
    setPlayerStates,
    teamGoalTargets,
    teamIds,
    teamOnePlayerIds,
    teamTwoPlayerIds,
    updateOpponentController,
  ]);
}
