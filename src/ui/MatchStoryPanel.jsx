import React from "react";

function formatEventLabel(event) {
  if (!event) {
    return "";
  }

  switch (event.type) {
    case "goal":
      return `${event.teamName} goal`;
    case "save":
      return `${event.teamName} save`;
    case "shot":
      return `${event.teamName} shot`;
    case "boost":
      return `${event.label} boost`;
    case "possession":
      return `${event.teamName} possession`;
    default:
      return event.label || event.type;
  }
}

function MatchStoryPanel({
  matchStats,
  eventTimeline,
  replayState,
  aiState,
  difficulty,
}) {
  const teamOnePossession = Math.round((matchStats?.possession?.teamOne || 0) * 100);
  const teamTwoPossession = 100 - teamOnePossession;
  const momentumPercent = Math.round(((matchStats?.momentum || 0) + 1) * 50);

  return (
    <section className="match-story-panel" aria-label="Match Story">
      <div className="story-header">
        <strong>Match Story</strong>
        <span className="story-difficulty">AI: {difficulty}</span>
      </div>

      <div className="momentum-wrap">
        <span>Momentum</span>
        <div className="momentum-track" aria-hidden="true">
          <span className="momentum-fill" style={{ width: `${momentumPercent}%` }} />
        </div>
      </div>

      <div className="possession-wrap">
        <span>Possession</span>
        <span>
          BRA {teamOnePossession}% - {teamTwoPossession}% ARG
        </span>
      </div>

      <div className="story-stats">
        <p>
          Shots <strong>{matchStats?.shots?.teamOne || 0}</strong> -{" "}
          <strong>{matchStats?.shots?.teamTwo || 0}</strong>
        </p>
        <p>
          On Target <strong>{matchStats?.onTarget?.teamOne || 0}</strong> -{" "}
          <strong>{matchStats?.onTarget?.teamTwo || 0}</strong>
        </p>
        <p>
          Saves <strong>{matchStats?.saves?.teamOne || 0}</strong> -{" "}
          <strong>{matchStats?.saves?.teamTwo || 0}</strong>
        </p>
      </div>

      <p className="story-ai-state" data-testid="ai-state">
        Opponent: <strong>{aiState?.mode || "idle"}</strong>
      </p>

      <p className="story-replay" data-testid="replay-state">
        Replay:{" "}
        <strong>
          {replayState?.isPlaying
            ? `${replayState.eventType || "event"} ${replayState.currentPlaybackIndex + 1}/${
                replayState.totalPlaybackFrames || 0
              }`
            : replayState?.mode || "idle"}
        </strong>
      </p>

      <div className="event-ticker" data-testid="event-ticker">
        {(eventTimeline || []).slice(0, 6).map((event) => (
          <p key={event.id}>
            <span>{formatEventLabel(event)}</span>
            <small>{event.clockLabel}</small>
          </p>
        ))}
      </div>
    </section>
  );
}

export default MatchStoryPanel;
