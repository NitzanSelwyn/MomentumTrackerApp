import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
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

    await httpClient.mutation(api.workerApp.updateLocationWithHistory, {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
      batteryLevel,
      isCharging,
    });
  } catch (err) {
    console.error("[BackgroundLocation] Failed to send location:", err);
  }
});
