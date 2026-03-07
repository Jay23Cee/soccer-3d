import { useEffect } from "react";

export default function useOutfieldAI({
  enabled,
  ballSnapshot,
  possessionState,
  difficulty,
  aiConfig,
  roster,
  activePlayerId,
  teamGoalTargets,
  createInitialOutfieldAiState,
  updateOutfieldController,
  setPlayerStates,
  setOutfieldAiStates,
  setBallActionCommand,
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
        const nextAiStates = {};
        let nextStates = currentStates;
        let hasChanges = false;
        let pendingAction = null;

        roster.forEach((actor) => {
          const currentPlayerState = currentStates[actor.playerId];
          if (!currentPlayerState) {
            nextAiStates[actor.playerId] = createInitialOutfieldAiState(actor.spawnPosition);
            return;
          }

          const isControlledPlayer = actor.playerId === activePlayerId;
          if (isControlledPlayer && actor.teamId === "teamOne") {
            nextAiStates[actor.playerId] = {
              ...(currentPlayerState.aiState || createInitialOutfieldAiState(actor.spawnPosition)),
              mode: "hold_shape",
              targetPosition: [...currentPlayerState.position],
              homePosition: [...actor.spawnPosition],
            };
            return;
          }

          const teammates = roster
            .filter(
              (candidate) =>
                candidate.teamId === actor.teamId && candidate.playerId !== actor.playerId
            )
            .map((candidate) => ({
              ...candidate,
              ...(currentStates[candidate.playerId] || {}),
            }));
          const opponents = roster
            .filter((candidate) => candidate.teamId !== actor.teamId)
            .map((candidate) => ({
              ...candidate,
              ...(currentStates[candidate.playerId] || {}),
            }));

          const nextAiState = updateOutfieldController({
            nowMs: now,
            deltaSeconds,
            difficulty,
            actor,
            playerState: currentPlayerState,
            aiState: currentPlayerState.aiState || currentStates[actor.playerId]?.aiState,
            teammates,
            opponents,
            ballSnapshot,
            possessionState,
            targetGoal: teamGoalTargets[actor.teamId],
            ownGoal:
              actor.teamId === "teamOne"
                ? teamGoalTargets.teamTwo
                : teamGoalTargets.teamOne,
            isControlledPlayer,
          });

          nextAiStates[actor.playerId] = nextAiState;

          if (!pendingAction && nextAiState.actionCommand) {
            pendingAction = nextAiState.actionCommand;
          }

          const nextPosition = nextAiState.nextPosition || currentPlayerState.position;
          const nextRotation = nextAiState.nextRotation || currentPlayerState.rotation;
          const positionChanged =
            Math.abs(nextPosition[0] - currentPlayerState.position[0]) > 0.0001 ||
            Math.abs(nextPosition[2] - currentPlayerState.position[2]) > 0.0001;
          const rotationChanged =
            Math.abs(nextRotation[1] - currentPlayerState.rotation[1]) > 0.0001;
          const aiChanged =
            currentPlayerState.aiState?.mode !== nextAiState.mode ||
            currentPlayerState.aiState?.targetPlayerId !== nextAiState.targetPlayerId;

          if (!positionChanged && !rotationChanged && !aiChanged) {
            return;
          }

          if (!hasChanges) {
            nextStates = { ...currentStates };
            hasChanges = true;
          }

          nextStates[actor.playerId] = {
            ...currentPlayerState,
            position: nextPosition,
            rotation: nextRotation,
            aiState: nextAiState,
          };
        });

        setOutfieldAiStates(nextAiStates);
        if (pendingAction) {
          setBallActionCommand((currentCommand) => currentCommand || pendingAction);
        }

        return nextStates;
      });
    }, aiConfig.UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [
    activePlayerId,
    aiConfig.UPDATE_INTERVAL_MS,
    aiLastUpdateAtRef,
    ballSnapshot,
    createInitialOutfieldAiState,
    difficulty,
    enabled,
    nowMs,
    possessionState,
    roster,
    setBallActionCommand,
    setOutfieldAiStates,
    setPlayerStates,
    teamGoalTargets,
    updateOutfieldController,
  ]);
}
