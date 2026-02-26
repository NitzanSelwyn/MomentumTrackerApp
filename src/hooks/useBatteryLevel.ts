import { useState, useEffect } from "react";
import * as Battery from "expo-battery";

export function useBatteryLevel() {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batteryState, setBatteryState] = useState<Battery.BatteryState>(
    Battery.BatteryState.UNKNOWN
  );

  useEffect(() => {
    // Get initial values
    Battery.getBatteryLevelAsync().then(setBatteryLevel).catch(() => {});
    Battery.getBatteryStateAsync().then(setBatteryState).catch(() => {});

    // Subscribe to changes
    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel: level }) => {
      setBatteryLevel(level);
    });
    const stateSub = Battery.addBatteryStateListener(({ batteryState: state }) => {
      setBatteryState(state);
    });

    return () => {
      levelSub.remove();
      stateSub.remove();
    };
  }, []);

  return {
    batteryLevel,
    batteryState,
    batteryStateLabel: Battery.BatteryState[batteryState],
  };
}
