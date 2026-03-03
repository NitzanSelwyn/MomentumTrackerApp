import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import { Barometer } from "expo-sensors";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { BACKGROUND_LOCATION_TASK, SECURE_STORE_KEYS } from "../constants/config";
import * as SecureStore from "expo-secure-store";

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL!;

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("[BackgroundLocation] Error:", error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as {
    locations: Array<{
      coords: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
        altitude: number | null;
        speed: number | null;
        heading: number | null;
      };
      timestamp: number;
    }>;
  };

  if (!locations || locations.length === 0) return;

  try {
    const token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.CLERK_JWT);
    if (!token) {
      console.warn("[BackgroundLocation] No JWT token found, skipping update");
      return;
    }

    const httpClient = new ConvexHttpClient(CONVEX_URL);
    httpClient.setAuth(token);

    const location = locations[locations.length - 1];
    let batteryLevel: number | undefined;
    let isCharging: boolean | undefined;

    try {
      const level = await Battery.getBatteryLevelAsync();
      batteryLevel = level >= 0 ? Math.round(level * 100) : undefined;
      const state = await Battery.getBatteryStateAsync();
      isCharging = state === Battery.BatteryState.CHARGING;
    } catch {
      // Battery info not available
    }

    // Read location mode and baseline pressure from SecureStore
    let locationMode: "outdoor" | "indoor" | undefined;
    let floor: number | undefined;
    let pressure: number | undefined;

    try {
      const storedMode = await SecureStore.getItemAsync(SECURE_STORE_KEYS.LOCATION_MODE);
      if (storedMode === "outdoor" || storedMode === "indoor") {
        locationMode = storedMode;
      }

      const storedBaseline = await SecureStore.getItemAsync(SECURE_STORE_KEYS.BASELINE_PRESSURE);
      if (storedBaseline) {
        const baselinePressure = parseFloat(storedBaseline);

        // Try to get current barometer reading
        const baroAvailable = await Barometer.isAvailableAsync();
        if (baroAvailable) {
          await new Promise<void>((resolve) => {
            const sub = Barometer.addListener(({ pressure: p }) => {
              pressure = p;
              const relativeAltitude = (baselinePressure - p) * 8.5;
              floor = Math.round(relativeAltitude / 3.5);
              sub.remove();
              resolve();
            });
            // Timeout fallback after 1.5s
            setTimeout(() => {
              sub.remove();
              resolve();
            }, 1500);
          });
        }
      }
    } catch {
      // SecureStore or sensor read failed — proceed without sensor data
    }

    await httpClient.mutation(api.workerApp.updateLocationWithHistory, {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
      batteryLevel,
      isCharging,
      heading: location.coords.heading ?? undefined,
      altitude: location.coords.altitude ?? undefined,
      speed: location.coords.speed ?? undefined,
      locationMode,
      floor,
      pressure,
    });
  } catch (err) {
    console.error("[BackgroundLocation] Failed to send location:", err);
  }
});
