import { describe, expect, it, vi } from "vitest";
import {
  START_STING_CONFIG,
  createStartStingAudio,
  playStartSting,
  stopStartSting,
} from "./startSting";

describe("startSting", () => {
  it("creates a configured audio element when Audio is available", () => {
    const originalAudio = globalThis.Audio;
    const audioInstance = {
      preload: "",
      volume: 0,
    };
    globalThis.Audio = vi.fn(function MockAudio() {
      return audioInstance;
    });

    try {
      const createdAudio = createStartStingAudio();
      expect(createdAudio).toBe(audioInstance);
      expect(globalThis.Audio).toHaveBeenCalledWith(START_STING_CONFIG.src);
      expect(createdAudio.preload).toBe("auto");
      expect(createdAudio.volume).toBe(START_STING_CONFIG.volume);
    } finally {
      globalThis.Audio = originalAudio;
    }
  });

  it("plays, fades, and resets the sting", () => {
    vi.useFakeTimers();

    try {
      const audio = {
        currentTime: 14,
        volume: 0.2,
        play: vi.fn(() => Promise.resolve()),
        pause: vi.fn(),
      };

      const stopPlayback = playStartSting(audio);
      expect(audio.play).toHaveBeenCalledTimes(1);
      expect(audio.pause).toHaveBeenCalledTimes(1);
      expect(audio.currentTime).toBe(0);
      expect(audio.volume).toBe(START_STING_CONFIG.volume);

      vi.advanceTimersByTime(START_STING_CONFIG.maxDurationMs);

      expect(audio.pause).toHaveBeenCalledTimes(2);
      expect(audio.currentTime).toBe(0);
      expect(audio.volume).toBe(START_STING_CONFIG.volume);

      stopPlayback();
      expect(audio.pause).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops and rewinds the sting immediately", () => {
    const audio = {
      currentTime: 2.6,
      volume: 0.14,
      pause: vi.fn(),
    };

    stopStartSting(audio);

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(0);
    expect(audio.volume).toBe(START_STING_CONFIG.volume);
  });
});
