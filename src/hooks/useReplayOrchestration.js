import { useEffect } from "react";

export default function useReplayOrchestration({
  replayDirectorRef,
  setReplayState,
  setReplayFrame,
  nowMs,
}) {
  useEffect(() => {
    const timer = setInterval(() => {
      const now = nowMs();
      const nextReplayState = replayDirectorRef.current.update(now);
      setReplayState(nextReplayState);
      setReplayFrame(replayDirectorRef.current.getCurrentFrame());
    }, 33);

    return () => clearInterval(timer);
  }, [nowMs, replayDirectorRef, setReplayFrame, setReplayState]);
}
