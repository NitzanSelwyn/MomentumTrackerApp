import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";

export function useLocationPermissions() {
  const [foregroundStatus, setForegroundStatus] =
    useState<Location.PermissionStatus | null>(null);
  const [backgroundStatus, setBackgroundStatus] =
    useState<Location.PermissionStatus | null>(null);

  const checkPermissions = useCallback(async () => {
    const fg = await Location.getForegroundPermissionsAsync();
    setForegroundStatus(fg.status);

    if (fg.status === Location.PermissionStatus.GRANTED) {
      const bg = await Location.getBackgroundPermissionsAsync();
      setBackgroundStatus(bg.status);
    }
  }, []);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const fg = await Location.requestForegroundPermissionsAsync();
    setForegroundStatus(fg.status);

    if (fg.status !== Location.PermissionStatus.GRANTED) {
      return false;
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    setBackgroundStatus(bg.status);

    return bg.status === Location.PermissionStatus.GRANTED;
  }, []);

  return {
    foregroundStatus,
    backgroundStatus,
    hasForeground: foregroundStatus === Location.PermissionStatus.GRANTED,
    hasBackground: backgroundStatus === Location.PermissionStatus.GRANTED,
    requestPermissions,
    checkPermissions,
  };
}
