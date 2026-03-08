import { useEffect, useRef } from "react";
import { BALL_ZONES } from "../ai/outfieldController";

function distance2D(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function attackDirectionFromGoal(targetGoal) {
  return targetGoal?.[2] >= 0 ? 1 : -1;
}

function deriveBallZone(ballSnapshot, targetGoal) {
  if (!ballSnapshot?.position || !targetGoal) {
    return BALL_ZONES.MIDFIELD;
  }

  const attackDirection = attackDirectionFromGoal(targetGoal);
  const progress = ballSnapshot.position[2] * attackDirection;
  const attackingThreshold = 24;
  const defensiveThreshold = -24;

  if (progress >= attackingThreshold) {
    return BALL_ZONES.ATTACKING_THIRD;
  }

  if (progress <= defensiveThreshold) {
    return BALL_ZONES.DEFENSIVE_THIRD;
  }

  return BALL_ZONES.MIDFIELD;
}

function pruneActionLocks(actionLocks = {}, nowMs) {
  return Object.entries(actionLocks).reduce((activeLocks, [playerId, actionLock]) => {
    if (actionLock?.expiresAtMs > nowMs) {
      activeLocks[playerId] = actionLock;
    }
    return activeLocks;
  }, {});
}

function buildTeamPlayers({ roster, currentStates, teamId }) {
  return roster
    .filter((candidate) => candidate.teamId === teamId)
    .map((candidate) => {
      const state = currentStates[candidate.playerId] || {};
      return {
        ...candidate,
        ...state,
        position: state.position || candidate.spawnPosition,
        rotation: state.rotation || candidate.spawnRotation,
      };
    });
}

function deriveSupportRunnerId({ teamPlayers, carrierId, targetGoal }) {
  if (!carrierId || teamPlayers.length <= 1) {
    return null;
  }

  const carrier = teamPlayers.find((player) => player.playerId === carrierId);
  if (!carrier) {
    return null;
  }

  const carrierPosition = carrier.position || carrier.spawnPosition;
  const attackDirection = attackDirectionFromGoal(targetGoal);

  return teamPlayers
    .filter((player) => player.playerId !== carrierId)
    .map((player) => {
      const position = player.position || player.spawnPosition;
      const forwardProgress = (position[2] - carrierPosition[2]) * attackDirection;
      const width = Math.abs(position[0] - carrierPosition[0]);
      const laneBonus = player.attackLane === carrier.attackLane ? -4 : 4;
      const score = forwardProgress * 0.68 + width * 0.42 + laneBonus;
      return {
        playerId: player.playerId,
        score,
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.playerId || null;
}

function deriveTeamContext({
  teamId,
  roster,
  currentStates,
  possessionState,
  protectedPossessionTeamId,
  ballSnapshot,
  teamGoalTargets,
  nowMs,
  teamAttackMemoryRef,
}) {
  const teamPlayers = buildTeamPlayers({ roster, currentStates, teamId });
  const opponentPlayers = roster
    .filter((candidate) => candidate.teamId !== teamId)
    .map((candidate) => {
      const state = currentStates[candidate.playerId] || {};
      return {
        ...candidate,
        ...state,
        position: state.position || candidate.spawnPosition,
        rotation: state.rotation || candidate.spawnRotation,
      };
    });
  const existingMemory = teamAttackMemoryRef.current[teamId] || {};
  const hasPossession = possessionState?.teamId === teamId;
  const opponentHasProtectedKeeperPossession =
    protectedPossessionTeamId && protectedPossessionTeamId !== teamId;
  const ballPosition = ballSnapshot?.position || [0, 0, 0];
  const opponentCarrier =
    !opponentHasProtectedKeeperPossession &&
    possessionState?.teamId &&
    possessionState.teamId !== teamId
      ? opponentPlayers.find((player) => player.playerId === possessionState.playerId) || null
      : null;
  const contestAnchor = opponentCarrier?.position || ballPosition;
  const defendersByDistance = [...teamPlayers].sort(
    (left, right) => distance2D(left.position, contestAnchor) - distance2D(right.position, contestAnchor)
  );

  return {
    teamId,
    primaryPresserId:
      hasPossession || opponentHasProtectedKeeperPossession
        ? null
        : defendersByDistance[0]?.playerId || null,
    secondaryCoverId:
      hasPossession || opponentHasProtectedKeeperPossession
        ? null
        : defendersByDistance[1]?.playerId || null,
    supportRunnerId: hasPossession
      ? deriveSupportRunnerId({
          teamPlayers,
          carrierId: possessionState?.playerId || null,
          targetGoal: teamGoalTargets[teamId],
        })
      : null,
    ballZone: deriveBallZone(ballSnapshot, teamGoalTargets[teamId]),
    possessionStartMs: hasPossession ? existingMemory.possessionStartMs || nowMs : null,
    actionLocks: hasPossession ? pruneActionLocks(existingMemory.actionLocks, nowMs) : {},
  };
}

export default function useOutfieldAI({
  enabled,
  ballSnapshot,
  possessionState,
  protectedPossessionTeamId = null,
  difficulty,
  aiPaceMultiplier,
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
  teamAttackMemoryRef,
}) {
  const ballSnapshotRef = useRef(ballSnapshot);
  const possessionStateRef = useRef(possessionState);
  const protectedPossessionTeamIdRef = useRef(protectedPossessionTeamId);

  useEffect(() => {
    ballSnapshotRef.current = ballSnapshot;
  }, [ballSnapshot]);

  useEffect(() => {
    possessionStateRef.current = possessionState;
  }, [possessionState]);

  useEffect(() => {
    protectedPossessionTeamIdRef.current = protectedPossessionTeamId;
  }, [protectedPossessionTeamId]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const timer = setInterval(() => {
      const latestBallSnapshot = ballSnapshotRef.current;
      const latestPossessionState = possessionStateRef.current;
      const latestProtectedPossessionTeamId = protectedPossessionTeamIdRef.current;

      if (!latestBallSnapshot) {
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
        const teamIds = [...new Set(roster.map((player) => player.teamId))];
        const teamContexts = teamIds.reduce((contexts, teamId) => {
          contexts[teamId] = deriveTeamContext({
            teamId,
            roster,
            currentStates,
            possessionState: latestPossessionState,
            protectedPossessionTeamId: latestProtectedPossessionTeamId,
            ballSnapshot: latestBallSnapshot,
            teamGoalTargets,
            nowMs: now,
            teamAttackMemoryRef,
          });
          return contexts;
        }, {});
        const nextActionLocksByTeam = teamIds.reduce((locksByTeam, teamId) => {
          locksByTeam[teamId] = { ...(teamContexts[teamId]?.actionLocks || {}) };
          return locksByTeam;
        }, {});

        roster.forEach((actor) => {
          const currentPlayerState = currentStates[actor.playerId];
          if (!currentPlayerState) {
            nextAiStates[actor.playerId] = createInitialOutfieldAiState(actor.spawnPosition);
            delete nextActionLocksByTeam[actor.teamId]?.[actor.playerId];
            return;
          }

          const isControlledPlayer = actor.playerId === activePlayerId;
          if (isControlledPlayer && actor.teamId === "teamOne") {
            nextAiStates[actor.playerId] = {
              ...(currentPlayerState.aiState || createInitialOutfieldAiState(actor.spawnPosition)),
              mode: "hold_shape",
              assignment: null,
              targetPosition: [...currentPlayerState.position],
              homePosition: [...actor.spawnPosition],
              actionLock: null,
            };
            delete nextActionLocksByTeam[actor.teamId]?.[actor.playerId];
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
              position: currentStates[candidate.playerId]?.position || candidate.spawnPosition,
              rotation: currentStates[candidate.playerId]?.rotation || candidate.spawnRotation,
            }));
          const opponents = roster
            .filter((candidate) => candidate.teamId !== actor.teamId)
            .map((candidate) => ({
              ...candidate,
              ...(currentStates[candidate.playerId] || {}),
              position: currentStates[candidate.playerId]?.position || candidate.spawnPosition,
              rotation: currentStates[candidate.playerId]?.rotation || candidate.spawnRotation,
            }));

          const nextAiState = updateOutfieldController({
            nowMs: now,
            deltaSeconds,
            difficulty,
            aiPaceMultiplier,
            actor,
            playerState: currentPlayerState,
            aiState: currentPlayerState.aiState || currentStates[actor.playerId]?.aiState,
            teammates,
            opponents,
            ballSnapshot: latestBallSnapshot,
            possessionState: latestPossessionState,
            targetGoal: teamGoalTargets[actor.teamId],
            ownGoal:
              actor.teamId === "teamOne"
                ? teamGoalTargets.teamTwo
                : teamGoalTargets.teamOne,
            teamContext: teamContexts[actor.teamId],
            isControlledPlayer,
          });

          nextAiStates[actor.playerId] = nextAiState;

          if (!pendingAction && nextAiState.actionCommand) {
            pendingAction = nextAiState.actionCommand;
          }

          if (nextAiState.actionLock) {
            nextActionLocksByTeam[actor.teamId][actor.playerId] = nextAiState.actionLock;
          } else {
            delete nextActionLocksByTeam[actor.teamId][actor.playerId];
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
            currentPlayerState.aiState?.assignment !== nextAiState.assignment ||
            currentPlayerState.aiState?.targetPlayerId !== nextAiState.targetPlayerId ||
            currentPlayerState.aiState?.phase !== nextAiState.phase;

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

        teamIds.forEach((teamId) => {
          teamAttackMemoryRef.current[teamId] = {
            possessionStartMs: teamContexts[teamId]?.possessionStartMs || null,
            ballZone: teamContexts[teamId]?.ballZone || BALL_ZONES.MIDFIELD,
            actionLocks: nextActionLocksByTeam[teamId] || {},
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
    aiPaceMultiplier,
    createInitialOutfieldAiState,
    difficulty,
    enabled,
    nowMs,
    protectedPossessionTeamId,
    roster,
    setBallActionCommand,
    setOutfieldAiStates,
    setPlayerStates,
    teamAttackMemoryRef,
    teamGoalTargets,
    updateOutfieldController,
  ]);
}
