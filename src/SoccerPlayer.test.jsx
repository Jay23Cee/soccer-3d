import { describe, expect, it } from "vitest";
import SoccerPlayer from "./SoccerPlayer";

function elementChildren(element) {
  const children = element?.props?.children;

  if (!children) {
    return [];
  }

  return Array.isArray(children) ? children : [children];
}

function findElementByName(element, name) {
  if (!element || typeof element !== "object") {
    return null;
  }

  if (element.props?.name === name) {
    return element;
  }

  for (const child of elementChildren(element)) {
    const match = findElementByName(child, name);
    if (match) {
      return match;
    }
  }

  return null;
}

describe("SoccerPlayer", () => {
  it("renders a root player group with compatibility name", () => {
    const player = SoccerPlayer({});

    expect(player.type).toBe("group");
    expect(player.props.name).toBe("player-one");
  });

  it("applies custom position and rotation to the root group", () => {
    const position = [4, 0, -10];
    const rotation = [0.1, 1.2, -0.2];
    const player = SoccerPlayer({ position, rotation });

    expect(player.props.position).toEqual(position);
    expect(player.props.rotation).toEqual(rotation);
  });

  it("includes expected stylized body-part meshes", () => {
    const player = SoccerPlayer({});
    const requiredMeshes = [
      "torso-core",
      "head-skin",
      "left-arm-segment",
      "right-arm-segment",
      "left-leg-segment",
      "right-leg-segment",
    ];

    requiredMeshes.forEach((meshName) => {
      expect(findElementByName(player, meshName)).toBeTruthy();
    });
  });
});
