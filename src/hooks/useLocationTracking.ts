import { useRef, useCallback } from "react";
import * as Location from "expo-location";
import { BACKGROUND_LOCATION_TASK, LOCATION_TRACKING } from "../constants/config";

export type LocationUpdateData = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  altitude?: number;
  speed?: number;
  // Sensor fusion fields
  floor?: number;
  isMoving?: boolean;
  locationMode?: "outdoor" | "indoor";
  stepCount?: number;
  pressure?: number;
};

type LocationCallback = (data: LocationUpdateData) => void;

type SensorData = {
  pressure: number | null;
  estimatedFloor: number;
  heading: number | null;
  stepCount: number;
  isMoving: boolean;
};

export function useLocationTracking() {
  const watchSubscription = useRef<Location.LocationSubscription | null>(null);

  const startTracking = useCallback(async (
    onLocationUpdate?: LocationCallback,
    timeIntervalOverride?: number,
    locationMode?: "outdoor" | "indoor",
    sensorData?: SensorData,
  ) => {
    const timeInterval = timeIntervalOverride ?? LOCATION_TRACKING.timeInterval;
    const accuracy = locationMode === "indoor"
      ? Location.Accuracy.BestForNavigation  // 6
      : LOCATION_TRACKING.accuracy as Location.Accuracy; // 4

    // Start foreground watch
    watchSubscription.current = await Location.watchPositionAsync(
      {
        accuracy,
        timeInterval,
        distanceInterval: LOCATION_TRACKING.distanceInterval,
      },
      (location) => {
        if (!onLocationUpdate) return;
        const data: LocationUpdateData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? undefined,
          heading: location.coords.heading ?? undefined,
          altitude: location.coords.altitude ?? undefined,
          speed: location.coords.speed ?? undefined,
          // Merge sensor fusion data if provided
          floor: sensorData?.estimatedFloor,
          isMoving: sensorData?.isMoving,
          locationMode,
          stepCount: sensorData?.stepCount,
          pressure: sensorData?.pressure ?? undefined,
        };
        onLocationUpdate(data);
      }
    );

    // Start background location updates (fails gracefully in Expo Go on Android)
    try {
      const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK
      ).catch(() => false);

      if (!isTaskRunning) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy,
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
