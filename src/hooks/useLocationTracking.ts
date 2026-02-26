import { useRef, useCallback } from "react";
import * as Location from "expo-location";
import { BACKGROUND_LOCATION_TASK, LOCATION_TRACKING } from "../constants/config";

type LocationCallback = (location: Location.LocationObject) => void;

export function useLocationTracking() {
  const watchSubscription = useRef<Location.LocationSubscription | null>(null);

  const startTracking = useCallback(async (
    onLocationUpdate?: LocationCallback,
    timeIntervalOverride?: number,
  ) => {
    const timeInterval = timeIntervalOverride ?? LOCATION_TRACKING.timeInterval;

    // Start foreground watch
    watchSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: LOCATION_TRACKING.accuracy as Location.Accuracy,
        timeInterval,
        distanceInterval: LOCATION_TRACKING.distanceInterval,
      },
      (location) => {
        onLocationUpdate?.(location);
      }
    );

    // Start background location updates (fails gracefully in Expo Go on Android)
    try {
      const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK
      ).catch(() => false);

      if (!isTaskRunning) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: LOCATION_TRACKING.accuracy as Location.Accuracy,
          timeInterval,
          distanceInterval: LOCATION_TRACKING.distanceInterval,
          foregroundService: LOCATION_TRACKING.foregroundService,
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
        });
      }
    } catch (err) {
      console.warn("[LocationTracking] Background tracking not available (Expo Go?):", err);
    }
  }, []);

  const stopTracking = useCallback(async () => {
    if (watchSubscription.current) {
      watchSubscription.current.remove();
      watchSubscription.current = null;
    }

    const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK
    ).catch(() => false);

    if (isTaskRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  }, []);

  return { startTracking, stopTracking };
}
