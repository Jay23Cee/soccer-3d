import React from "react";

function LandingSetupPanel({
  appTitle,
  statusLabel,
  teamOneName,
  teamTwoName,
  setupSummaryItems,
  difficultyOptions,
  selectedDifficultyValue,
  selectedDifficultyDetail,
  cameraOptions,
  selectedCameraValue,
  selectedCameraLabel,
  cameraSelectionLocked,
  controlTarget,
  controlTargets,
  controlFocusDescription,
  onStartMatch,
  onBackToTitle,
  onSelectDifficulty,
  onSelectCamera,
  onSelectControlTarget,
  optionsPanel,
}) {
  return (
    <section className="landing-menu-shell">
      <div className="landing-menu-panel">
        <div className="landing-menu-header">
          <div className="landing-menu-heading">
            <p className="landing-menu-kicker">{appTitle}</p>
            <h1 className="landing-menu-title">Match Setup</h1>
            <p className="landing-menu-copy">
              Tune the rush before kickoff, then launch straight into {teamOneName} vs {teamTwoName}.
            </p>
          </div>
          <p className="status-label">{statusLabel}</p>
        </div>

        <div className="landing-menu-body" data-testid="landing-menu-body">
          <p className="fixture-label landing-menu-fixture">
            <span>{teamOneName}</span>
            <span className="fixture-vs">vs</span>
            <span>{teamTwoName}</span>
          </p>

          <section className="hub-summary" data-testid="setup-summary">
            <p className="hub-summary-kicker">Current Setup</p>
            <h2 className="hub-summary-title">Center-circle kickoff, your way.</h2>
            <p className="hub-summary-copy">
              Difficulty, camera, control focus, and kickoff sound are all live here.
            </p>
            <div className="setup-summary-grid">
              {setupSummaryItems.map((item) => (
                <div className="setup-summary-card" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="selection-section">
            <div className="selection-heading">
              <strong>Difficulty</strong>
              <span>{selectedDifficultyDetail}</span>
            </div>
            <div className="selection-grid selection-grid-three">
              {difficultyOptions.map((option) => (
                <button
                  key={option.value}
                  className={`selection-card${selectedDifficultyValue === option.value ? " is-active" : ""}`}
                  onClick={() => onSelectDifficulty(option.value)}
                  type="button"
                  aria-pressed={selectedDifficultyValue === option.value}
                >
                  <span className="selection-card-label">{option.label}</span>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="selection-section">
            <div className="selection-heading">
              <strong>Camera POV</strong>
              <span>{selectedCameraLabel}</span>
            </div>
            <div className="selection-grid selection-grid-camera">
              {cameraOptions.map((option) => (
                <button
                  key={option.value}
                  className={`selection-card selection-card-compact${
                    selectedCameraValue === option.value ? " is-active" : ""
                  }`}
                  onClick={() => onSelectCamera(option.value)}
                  type="button"
                  aria-pressed={selectedCameraValue === option.value}
                  disabled={cameraSelectionLocked}
                >
                  <span className="selection-card-label">{option.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="selection-section">
            <div className="selection-heading">
              <strong>Control Focus</strong>
              <span>{controlFocusDescription}</span>
            </div>
            <div className="controls controls-compact">
              <button
                className={controlTarget === controlTargets.PLAYER ? "btn-primary" : "btn-ghost"}
                onClick={() => onSelectControlTarget(controlTargets.PLAYER)}
                type="button"
                aria-pressed={controlTarget === controlTargets.PLAYER}
              >
                Control Player
              </button>

              <button
                className={controlTarget === controlTargets.BALL ? "btn-primary" : "btn-ghost"}
                onClick={() => onSelectControlTarget(controlTargets.BALL)}
                type="button"
                aria-pressed={controlTarget === controlTargets.BALL}
              >
                Control Ball
              </button>
            </div>
          </section>

          {optionsPanel}
        </div>

        <div className="landing-menu-footer">
          <button className="btn-ghost landing-menu-back" onClick={onBackToTitle} type="button">
            Back to Title
          </button>
          <button className="btn-primary landing-menu-start" onClick={onStartMatch} type="button">
            Start Match
          </button>
        </div>
      </div>
    </section>
  );
}

export default LandingSetupPanel;
