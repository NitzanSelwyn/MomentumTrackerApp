export const BACKGROUND_LOCATION_TASK = "background-location-task";

export const LOCATION_TRACKING = {
  accuracy: 4, // LocationAccuracy.High
  timeInterval: 10_000, // 10 seconds
  distanceInterval: 10, // 10 meters
  foregroundService: {
    notificationTitle: "MomentumTracker",
    notificationBody: "Tracking your location",
    notificationColor: "#4A90D9",
  },
};

export const TOKEN_REFRESH_INTERVAL = 30_000; // 30 seconds

export const SECURE_STORE_KEYS = {
  CLERK_JWT: "clerk-jwt",
  LOCATION_MODE: "location-mode",
  BASELINE_PRESSURE: "baseline-pressure",
};

export const LOCATION_MODES = {
  OUTDOOR: "outdoor" as const,
  INDOOR: "indoor" as const,
};

export const SENSOR_CONFIG = {
  barometerInterval: 2000,
  magnetometerInterval: 500,
  accelerometerInterval: 500,
  gpsIndoorAccuracyThreshold: 15,
};
