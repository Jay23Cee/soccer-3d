import React from "react";

function LandingHero({ children, mode = "title" }) {
  return (
    <section
      className={`landing-screen is-${mode}`}
      data-testid="landing-hero"
      aria-label="Goal Rush landing screen"
    >
      {children}
    </section>
  );
}

export default LandingHero;
