export const MATCH_EVENT_TYPES = Object.freeze({
  GOAL: "goal",
  SHOT: "shot",
  SAVE: "save",
  PASS: "pass",
  TACKLE: "tackle",
  KICKOFF: "kickoff",
  THROW_IN: "throw_in",
  CORNER_KICK: "corner_kick",
  GOAL_KICK: "goal_kick",
  KEEPER_PUNT: "keeper_punt",
  HALFTIME: "halftime",
  END: "end",
  POWER_PLAY: "power_play",
  BOOST: "boost",
  POSSESSION: "possession",
  BALL_POP: "ball_pop",
});

export function formatMatchEventLabel(event) {
  if (!event) {
    return "";
  }

  switch (event.type) {
    case MATCH_EVENT_TYPES.GOAL:
      return `${event.teamName} goal`;
    case MATCH_EVENT_TYPES.SAVE:
      return `${event.teamName} save`;
    case MATCH_EVENT_TYPES.SHOT:
      return `${event.teamName} shot`;
    case MATCH_EVENT_TYPES.BOOST:
    case MATCH_EVENT_TYPES.POWER_PLAY:
      return `${event.label} boost`;
    case MATCH_EVENT_TYPES.POSSESSION:
      return `${event.teamName} possession`;
    case MATCH_EVENT_TYPES.KICKOFF:
      return `${event.teamName} kickoff`;
    case MATCH_EVENT_TYPES.THROW_IN:
      return `${event.teamName} throw-in`;
    case MATCH_EVENT_TYPES.CORNER_KICK:
      return `${event.teamName} corner`;
    case MATCH_EVENT_TYPES.GOAL_KICK:
      return `${event.teamName} goal kick`;
    case MATCH_EVENT_TYPES.KEEPER_PUNT:
      return `${event.teamName} keeper punt`;
    default:
      return event.label || event.type;
  }
}
