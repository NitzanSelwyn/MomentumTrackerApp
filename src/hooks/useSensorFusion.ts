import { useState, useRef, useCallback } from "react";
import {
  Barometer,
  Magnetometer,
  Accelerometer,
  Pedometer,
} from "expo-sensors";
import { SENSOR_CONFIG } from "../constants/config";

type Subscription = { remove: () => void };

export function useSensorFusion() {
  const [pressure, setPressure] = useState<number | null>(null);
  const [estimatedFloor, setEstimatedFloor] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [stepCount, setStepCount] = useState(0);
  const [isMoving, setIsMoving] = useState(false);

  const baselinePressureRef = useRef<number | null>(null);
  const barometerSub = useRef<Subscription | null>(null);
  const magnetometerSub = useRef<Subscription | null>(null);
  const accelerometerSub = useRef<Subscription | null>(null);
  const pedometerSub = useRef<Subscription | null>(null);

  const resetBaseline = useCallback(() => {
    if (pressure !== null) {
      baselinePressureRef.current = pressure;
      setEstimatedFloor(0);
    }
  }, [pressure]);

  const startSensors = useCallback(async () => {
    // Barometer
    const baroAvailable = await Barometer.isAvailableAsync();
    if (baroAvailable) {
      Barometer.setUpdateInterval(SENSOR_CONFIG.barometerInterval);
      barometerSub.current = Barometer.addListener(({ pressure: p }) => {
        setPressure(p);
        if (baselinePressureRef.current !== null) {
          const relativeAltitude = (baselinePressureRef.current - p) * 8.5;
          setEstimatedFloor(Math.round(relativeAltitude / 3.5));
        } else {
          // Set initial baseline on first reading
          baselinePressureRef.current = p;
        }
      });
    }

    // Magnetometer
    const magAvailable = await Magnetometer.isAvailableAsync();
    if (magAvailable) {
      Magnetometer.setUpdateInterval(SENSOR_CONFIG.magnetometerInterval);
      magnetometerSub.current = Magnetometer.addListener(({ x, y }) => {
        const h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        setHeading(h);
      });
    }

    // Accelerometer
    const accelAvailable = await Accelerometer.isAvailableAsync();
    if (accelAvailable) {
      Accelerometer.setUpdateInterval(SENSOR_CONFIG.accelerometerInterval);
      accelerometerSub.current = Accelerometer.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        // Subtract gravity (1g) and check if net acceleration > threshold
        setIsMoving(Math.abs(magnitude - 1) > 0.12);
      });
    }

    // Pedometer
    const pedoAvailable = await Pedometer.isAvailableAsync();
    if (pedoAvailable) {
      pedometerSub.current = Pedometer.watchStepCount(({ steps }) => {
        setStepCount(steps);
      });
    }
  }, []);

  const stopSensors = useCallback(() => {
    barometerSub.current?.remove();
    magnetometerSub.current?.remove();
    accelerometerSub.current?.remove();
    pedometerSub.current?.remove();
    barometerSub.current = null;
    magnetometerSub.current = null;
    accelerometerSub.current = null;
    pedometerSub.current = null;
    baselinePressureRef.current = null;
    setStepCount(0);
    setIsMoving(false);
    setEstimatedFloor(0);
  }, []);

  return {
    pressure,
    estimatedFloor,
    heading,
    stepCount,
    isMoving,
    startSensors,
    stopSensors,
    resetBaseline,
  };
}
