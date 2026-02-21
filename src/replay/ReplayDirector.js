import { REPLAY_CONFIG } from "../config/gameConfig";

function cloneFrame(frame) {
  return {
    timestampMs: frame.timestampMs,
    ball: frame.ball ? { ...frame.ball } : null,
    players: frame.players ? frame.players.map((player) => ({ ...player })) : [],
    keepers: frame.keepers ? frame.keepers.map((keeper) => ({ ...keeper })) : [],
    cameraTarget: frame.cameraTarget ? [...frame.cameraTarget] : [0, 0, 0],
  };
}

export function createReplayDirector(customConfig = {}) {
  const config = {
    ...REPLAY_CONFIG,
    ...customConfig,
    STATE: {
      ...REPLAY_CONFIG.STATE,
      ...(customConfig.STATE || {}),
    },
  };

  const internal = {
    state: config.STATE.IDLE,
    buffer: [],
    playbackFrames: [],
    anchorFrameIndex: -1,
    armedAtMs: 0,
    eventType: null,
    eventId: null,
    playbackStartedAtMs: 0,
    cooldownUntilMs: 0,
    lastCaptureAtMs: 0,
    currentPlaybackIndex: 0,
  };

  function trimBuffer() {
    const overflow = internal.buffer.length - config.MAX_BUFFER_FRAMES;
    if (overflow > 0) {
      internal.buffer.splice(0, overflow);
      internal.anchorFrameIndex = Math.max(-1, internal.anchorFrameIndex - overflow);
    }
  }

  function pushFrame(frame) {
    if (!frame || !Number.isFinite(frame.timestampMs)) {
      return;
    }

    if (
      internal.lastCaptureAtMs > 0 &&
      frame.timestampMs - internal.lastCaptureAtMs < config.FRAME_INTERVAL_MS
    ) {
      return;
    }

    internal.lastCaptureAtMs = frame.timestampMs;
    internal.buffer.push(cloneFrame(frame));
    trimBuffer();
  }

  function armReplay(event, nowMs) {
    if (!event || !event.type) {
      return false;
    }

    if (internal.state === config.STATE.PLAYING || internal.state === config.STATE.ARMED) {
      return false;
    }

    if (internal.state === config.STATE.COOLDOWN && nowMs < internal.cooldownUntilMs) {
      return false;
    }

    internal.state = config.STATE.ARMED;
    internal.eventType = event.type;
    internal.eventId = event.id || `${event.type}-${Math.round(nowMs)}`;
    internal.armedAtMs = nowMs;
    internal.anchorFrameIndex = internal.buffer.length - 1;
    internal.playbackFrames = [];
    return true;
  }

  function beginPlayback(nowMs) {
    const startIndex = Math.max(0, internal.anchorFrameIndex - config.PRE_EVENT_FRAMES);
    const endIndex = Math.min(
      internal.buffer.length - 1,
      internal.anchorFrameIndex + config.POST_EVENT_FRAMES
    );
    if (endIndex <= startIndex) {
      return false;
    }

    internal.playbackFrames = internal.buffer.slice(startIndex, endIndex + 1).map(cloneFrame);
    internal.playbackStartedAtMs = nowMs;
    internal.currentPlaybackIndex = 0;
    internal.state = config.STATE.PLAYING;
    return true;
  }

  function update(nowMs) {
    if (internal.state === config.STATE.ARMED) {
      const readyFrameCount = internal.buffer.length - 1 - internal.anchorFrameIndex;
      if (readyFrameCount >= config.POST_EVENT_FRAMES || nowMs - internal.armedAtMs > 950) {
        const started = beginPlayback(nowMs);
        if (!started) {
          internal.state = config.STATE.IDLE;
        }
      }
    }

    if (internal.state === config.STATE.PLAYING) {
      const elapsedMs = nowMs - internal.playbackStartedAtMs;
      const playbackIndex = Math.floor(elapsedMs / config.FRAME_INTERVAL_MS);
      internal.currentPlaybackIndex = Math.max(
        0,
        Math.min(playbackIndex, Math.max(0, internal.playbackFrames.length - 1))
      );

      if (internal.currentPlaybackIndex >= internal.playbackFrames.length - 1) {
        internal.state = config.STATE.COOLDOWN;
        internal.cooldownUntilMs = nowMs + config.COOLDOWN_MS;
      }
    }

    if (internal.state === config.STATE.COOLDOWN && nowMs >= internal.cooldownUntilMs) {
      internal.state = config.STATE.IDLE;
      internal.eventType = null;
      internal.eventId = null;
      internal.playbackFrames = [];
      internal.currentPlaybackIndex = 0;
      internal.anchorFrameIndex = -1;
    }

    return getPublicState();
  }

  function skip(nowMs) {
    if (internal.state !== config.STATE.PLAYING) {
      return false;
    }

    internal.state = config.STATE.COOLDOWN;
    internal.cooldownUntilMs = nowMs + config.COOLDOWN_MS;
    return true;
  }

  function getCurrentFrame() {
    if (internal.state !== config.STATE.PLAYING) {
      return null;
    }

    return internal.playbackFrames[internal.currentPlaybackIndex] || null;
  }

  function getPublicState() {
    return {
      mode: internal.state,
      isPlaying: internal.state === config.STATE.PLAYING,
      canSkip: internal.state === config.STATE.PLAYING,
      eventType: internal.eventType,
      eventId: internal.eventId,
      currentPlaybackIndex: internal.currentPlaybackIndex,
      totalPlaybackFrames: internal.playbackFrames.length,
    };
  }

  return {
    pushFrame,
    armReplay,
    update,
    skip,
    getCurrentFrame,
    getPublicState,
  };
}
