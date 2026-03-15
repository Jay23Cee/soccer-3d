import React from "react";

function LandingTitleScreen({
  appTitle,
  statusLabel,
  teamOneName,
  teamTwoName,
  onStartMatch,
  onOpenMenu,
}) {
  const [topLine = "Goal", ...bottomLineParts] = appTitle.split(" ");
  const bottomLine = bottomLineParts.join(" ") || "Rush";

  return (
    <section className="landing-title-screen">
      <p className="landing-title-status">{statusLabel}</p>

      <div className="landing-title-logo-wrap">
        <p className="landing-title-kicker">Arcade football reloaded</p>
        <h1 className="landing-title-logo">
          <span className="landing-title-logo-top">{topLine}</span>{" "}
          <span className="landing-title-logo-bottom">{bottomLine}</span>
        </h1>
      </div>

      <p className="landing-title-press">PRESS START</p>

      <div className="landing-title-actions">
        <button className="landing-title-start" onClick={onStartMatch} type="button">
          Press Start
        </button>
        <button className="landing-title-menu-button" onClick={onOpenMenu} type="button">
          Match Setup
        </button>
      </div>

      <p className="landing-title-fixture">
        <span>{teamOneName}</span>
        <span className="fixture-vs">vs</span>
        <span>{teamTwoName}</span>
      </p>

      <p className="landing-title-copy">
        Pick up and play instantly, or open setup to tune camera, controls, and kickoff feel.
      </p>

      <p className="landing-title-footer">Field view locked in. Crowd ready.</p>
    </section>
  );
}

export default LandingTitleScreen;
