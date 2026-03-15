import { REPLAY_CONFIG } from "../config/gameConfig";

function cloneVector(vector, fallback = [0, 0, 0]) {
  if (!Array.isArray(vector)) {
    return [...fallback];
  }

  return [...vector];
}

function cloneEntity(entity) {
  if (!entity) {
    return null;
  }

  return {
    ...entity,
    position: cloneVector(entity.position),
    rotation: cloneVector(entity.rotation),
    velocity: cloneVector(entity.velocity),
  };
}

function cloneFrame(frame) {
  return {
    timestampMs: frame.timestampMs,
    ball: cloneEntity(frame.ball),
    players: frame.players ? frame.players.map((player) => cloneEntity(player)) : [],
    keepers: frame.keepers ? frame.keepers.map((keeper) => cloneEntity(keeper)) : [],
    cameraTarget: cloneVector(frame.cameraTarget),
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
    source: null,
    playlistIndex: 0,
    playlistLength: 0,
    archivedClips: [],
  };

  function clearPlaybackState() {
    internal.state = config.STATE.IDLE;
    internal.playbackFrames = [];
    internal.anchorFrameIndex = -1;
    internal.armedAtMs = 0;
    internal.eventType = null;
    internal.eventId = null;
    internal.playbackStartedAtMs = 0;
    internal.cooldownUntilMs = 0;
    internal.currentPlaybackIndex = 0;
    internal.source = null;
    internal.playlistIndex = 0;
    internal.playlistLength = 0;
  }

  function trimBuffer() {
    const overflow = internal.buffer.length - config.MAX_BUFFER_FRAMES;
    if (overflow > 0) {
      internal.buffer.splice(0, overflow);
      internal.anchorFrameIndex = Math.max(-1, internal.anchorFrameIndex - overflow);
    }
  }

  function trimArchivedClips() {
    const overflow = internal.archivedClips.length - config.MAX_ARCHIVED_CLIPS;
    if (overflow > 0) {
      internal.archivedClips.splice(0, overflow);
    }
  }

  function archivePlaybackClip(nowMs) {
    if (internal.eventType !== "goal" || internal.playbackFrames.length === 0) {
      return;
    }

    const archivedClip = {
      id: `clip-${internal.eventId}`,
      eventType: internal.eventType,
      eventId: internal.eventId,
      createdAtMs: nowMs,
      frames: internal.playbackFrames.map(cloneFrame),
    };
    const existingIndex = internal.archivedClips.findIndex((clip) => clip.eventId === internal.eventId);

    if (existingIndex >= 0) {
      internal.archivedClips.splice(existingIndex, 1, archivedClip);
    } else {
      internal.archivedClips.push(archivedClip);
      trimArchivedClips();
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
    internal.source = "live";
    internal.playlistIndex = 0;
    internal.playlistLength = 0;
    archivePlaybackClip(nowMs);
    return true;
  }

  function playArchivedClip(clipId, nowMs, options = {}) {
    const archivedClip = internal.archivedClips.find((clip) => clip.id === clipId);
    if (!archivedClip) {
      return false;
    }

    if (internal.state === config.STATE.PLAYING || internal.state === config.STATE.ARMED) {
      return false;
    }

    internal.playbackFrames = archivedClip.frames.map(cloneFrame);
    internal.playbackStartedAtMs = nowMs;
    internal.currentPlaybackIndex = 0;
    internal.state = config.STATE.PLAYING;
    internal.eventType = archivedClip.eventType;
    internal.eventId = archivedClip.eventId;
    internal.source = "highlights";
    internal.playlistIndex = Math.max(0, options.playlistIndex || 0);
    internal.playlistLength = Math.max(0, options.playlistLength || 0);
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
      clearPlaybackState();
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
      source: internal.source,
      playlistIndex: internal.playlistIndex,
      playlistLength: internal.playlistLength,
    };
  }

  function stop() {
    clearPlaybackState();
    return getPublicState();
  }

  function clearLiveBuffer() {
    internal.buffer = [];
    internal.anchorFrameIndex = -1;
    internal.lastCaptureAtMs = 0;
  }

  function getArchivedClips() {
    return internal.archivedClips.map((clip) => ({
      id: clip.id,
      eventType: clip.eventType,
      eventId: clip.eventId,
      createdAtMs: clip.createdAtMs,
    }));
  }

  function getBufferedFrameCount() {
    return internal.buffer.length;
  }

  return {
    pushFrame,
    armReplay,
    playArchivedClip,
    update,
    skip,
    stop,
    clearLiveBuffer,
    getArchivedClips,
    getBufferedFrameCount,
    getCurrentFrame,
    getPublicState,
  };
}
