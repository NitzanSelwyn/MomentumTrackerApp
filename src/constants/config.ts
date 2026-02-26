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
};
