export function estimatePosition(
  anchor: { lat: number; lng: number },
  steps: number,
  headingDeg: number,
  stepLengthM = 0.7
): { lat: number; lng: number; confidence: number } {
  const confidence = Math.max(0, 1 - steps / 200);
  const dMeters = steps * stepLengthM;
  const headingRad = (headingDeg * Math.PI) / 180;
  const anchorLatRad = (anchor.lat * Math.PI) / 180;

  const dLat = (dMeters * Math.cos(headingRad)) / 111320;
  const dLng = (dMeters * Math.sin(headingRad)) / (111320 * Math.cos(anchorLatRad));

  return {
    lat: anchor.lat + dLat,
    lng: anchor.lng + dLng,
    confidence,
  };
}

export function shouldUseDeadReckoning(
  gpsAccuracy: number | null,
  threshold = 15
): boolean {
  if (gpsAccuracy === null) return true;
  return gpsAccuracy > threshold;
}
