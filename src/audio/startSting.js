export const START_STING_CONFIG = {
  src: "/audio/pitch-pulse-start-sting.mp3",
  volume: 0.58,
  maxDurationMs: 6000,
  fadeOutMs: 900,
  fadeSteps: 9,
};

export function createStartStingAudio(config = START_STING_CONFIG) {
  if (typeof Audio === "undefined") {
    return null;
  }

  const audio = new Audio(config.src);
  audio.preload = "auto";
  audio.volume = config.volume;
  return audio;
}

export function stopStartSting(audio, config = START_STING_CONFIG) {
  if (!audio) {
    return;
  }

  if (typeof audio.pause === "function") {
    audio.pause();
  }

  if ("currentTime" in audio) {
    try {
      audio.currentTime = 0;
    } catch {
      // Some environments disallow rewinding; keep cleanup best-effort.
    }
  }

  if ("volume" in audio) {
    audio.volume = config.volume;
  }
}

export function playStartSting(audio, config = START_STING_CONFIG, timerApi = globalThis) {
  if (!audio || typeof audio.play !== "function") {
    return () => {};
  }

  const scheduledTimeouts = [];
  const scheduledIntervals = [];

  const clearScheduledTimers = () => {
    scheduledTimeouts.splice(0).forEach((timeoutId) => timerApi.clearTimeout?.(timeoutId));
    scheduledIntervals.splice(0).forEach((intervalId) => timerApi.clearInterval?.(intervalId));
  };

  stopStartSting(audio, config);

  const playResult = audio.play();
  if (playResult && typeof playResult.catch === "function") {
    playResult.catch(() => {});
  }

  const fadeDelayMs = Math.max(0, config.maxDurationMs - config.fadeOutMs);
  const fadeSteps = Math.max(1, config.fadeSteps);
  const fadeStepMs = Math.max(30, Math.floor(config.fadeOutMs / fadeSteps));

  const fadeTimeoutId = timerApi.setTimeout?.(() => {
    let currentStep = 0;
    const fadeIntervalId = timerApi.setInterval?.(() => {
      currentStep += 1;
      const nextVolumeRatio = Math.max(0, 1 - currentStep / fadeSteps);
      audio.volume = config.volume * nextVolumeRatio;

      if (currentStep >= fadeSteps) {
        if (fadeIntervalId !== undefined) {
          timerApi.clearInterval?.(fadeIntervalId);
        }
        stopStartSting(audio, config);
      }
    }, fadeStepMs);

    if (fadeIntervalId !== undefined) {
      scheduledIntervals.push(fadeIntervalId);
    }
  }, fadeDelayMs);

  if (fadeTimeoutId !== undefined) {
    scheduledTimeouts.push(fadeTimeoutId);
  }

  return () => {
    clearScheduledTimers();
    stopStartSting(audio, config);
  };
}
