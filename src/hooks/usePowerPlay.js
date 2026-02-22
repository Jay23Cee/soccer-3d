import { useEffect } from "react";

export default function usePowerPlay({
  activePowerZone,
  activeBoost,
  gameState,
  inPlayState,
  spawnDelayMs,
  spawnPowerZone,
  powerZoneSpawnTimeoutRef,
  powerZoneExpireTimeoutRef,
  setActivePowerZone,
  setBoostTimeLeftMs,
  nowMs,
}) {
  useEffect(() => {
    if (gameState === inPlayState && !activePowerZone) {
      if (powerZoneSpawnTimeoutRef.current) {
        clearTimeout(powerZoneSpawnTimeoutRef.current);
      }

      powerZoneSpawnTimeoutRef.current = setTimeout(() => {
        spawnPowerZone();
      }, spawnDelayMs);

      return () => {
        if (powerZoneSpawnTimeoutRef.current) {
          clearTimeout(powerZoneSpawnTimeoutRef.current);
          powerZoneSpawnTimeoutRef.current = null;
        }
      };
    }

    return undefined;
  }, [activePowerZone, gameState, inPlayState, powerZoneSpawnTimeoutRef, spawnDelayMs, spawnPowerZone]);

  useEffect(() => {
    if (gameState === inPlayState) {
      return;
    }

    if (powerZoneSpawnTimeoutRef.current) {
      clearTimeout(powerZoneSpawnTimeoutRef.current);
      powerZoneSpawnTimeoutRef.current = null;
    }

    if (powerZoneExpireTimeoutRef.current) {
      clearTimeout(powerZoneExpireTimeoutRef.current);
      powerZoneExpireTimeoutRef.current = null;
    }

    setActivePowerZone(null);
  }, [gameState, inPlayState, powerZoneExpireTimeoutRef, powerZoneSpawnTimeoutRef, setActivePowerZone]);

  useEffect(() => {
    if (!activeBoost) {
      setBoostTimeLeftMs(0);
      return undefined;
    }

    const updateRemaining = () => {
      const msLeft = Math.max(0, activeBoost.expiresAt - nowMs());
      setBoostTimeLeftMs(msLeft);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 100);

    return () => clearInterval(timer);
  }, [activeBoost, nowMs, setBoostTimeLeftMs]);
}
