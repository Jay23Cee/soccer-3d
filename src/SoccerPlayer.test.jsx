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

  it("uses playerId as root group name when provided", () => {
    const player = SoccerPlayer({ playerId: "player_two" });

    expect(player.props.name).toBe("player_two");
  });

  it("uses secondary kit colors when kitVariant is secondary", () => {
    const player = SoccerPlayer({ kitVariant: "secondary" });
    const torsoMesh = findElementByName(player, "torso-core");
    const torsoMaterial = elementChildren(torsoMesh).find(
      (child) => child?.type === "meshStandardMaterial"
    );

    expect(torsoMaterial.props.color).toBe("#f97316");
  });

  it("renders an active marker when isActive is true", () => {
    const player = SoccerPlayer({ isActive: true });

    expect(findElementByName(player, "active-marker")).toBeTruthy();
  });
});
