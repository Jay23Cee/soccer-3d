import React from "react";
import { Billboard, Text } from "@react-three/drei";

function ReplayWorldLabel({
  visible,
  position = [0, 18, 0],
  source = null,
  playlistIndex = 0,
  playlistLength = 0,
}) {
  if (!visible) {
    return null;
  }

  const highlightMode = source === "highlights";
  const titleSize = highlightMode ? 9.5 : 7.2;
  const subtitle = highlightMode && playlistLength > 0 ? `Goal ${playlistIndex + 1} / ${playlistLength}` : null;

  return (
    <Billboard follow position={position}>
      <Text
        data-testid="replay-world-label"
        anchorX="center"
        anchorY="middle"
        color={highlightMode ? "#f8fbff" : "#dffaff"}
        fontSize={titleSize}
        letterSpacing={0.16}
        outlineColor={highlightMode ? "#22d3ee" : "#0f172a"}
        outlineWidth={0.18}
      >
        REPLAY
      </Text>
      {subtitle ? (
        <Text
          anchorX="center"
          anchorY="middle"
          color="#d7f7ff"
          fontSize={titleSize * 0.34}
          letterSpacing={0.08}
          outlineColor="#082f49"
          outlineWidth={0.08}
          position={[0, -titleSize * 0.95, 0]}
        >
          {subtitle}
        </Text>
      ) : null}
    </Billboard>
  );
}

export default ReplayWorldLabel;
