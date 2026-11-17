import {
  mdiAccessPoint,
  mdiAccountOffOutline,
  mdiAccountOutline,
  mdiEmoticonHappyOutline,
  mdiEmoticonNeutralOutline,
  mdiEmoticonOutline,
  mdiFire,
  mdiLightbulbOutline,
  mdiRecordCircleOutline,
  mdiSnowflake,
  mdiStopCircleOutline,
  mdiWaterAlertOutline,
  mdiWaterOffOutline,
  mdiWaterPercent,
  mdiWeatherNight,
  mdiWeatherSunny,
  mdiWeatherSunnyAlert,
  mdiWhiteBalanceSunny,
} from '@mdi/js';
import type { Tone } from '../primitives';

export const TONE_INK: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  accent: 'text-accent-ink',
  success: 'text-success-ink',
  warning: 'text-warning-ink',
  danger: 'text-danger-ink',
};

export const TONE_BAR: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

// ============================================================================
// CO2 Thresholds and Utilities
// ============================================================================

export interface CO2Level {
  label: string;
  tone: Tone;
  description: string;
}

export const getCO2Level = (ppm: number): CO2Level => {
  if (ppm < 800) {
    return {
      label: 'Good',
      tone: 'success',
      description: 'Fresh air, excellent ventilation',
    };
  } else if (ppm < 1000) {
    return {
      label: 'Moderate',
      tone: 'accent',
      description: 'Acceptable, consider ventilation',
    };
  } else if (ppm < 2000) {
    return {
      label: 'Poor',
      tone: 'warning',
      description: 'Stale air, open windows recommended',
    };
  } else {
    return {
      label: 'Unhealthy',
      tone: 'danger',
      description: 'Poor air quality, ventilate immediately',
    };
  }
};

// ============================================================================
// Comfort Index Calculations
// ============================================================================

export interface ComfortLevel {
  label: string;
  tone: Tone;
  icon: string;
}

/**
 * Calculate dew point using Magnus formula approximation
 * @param tempC Temperature in Celsius
 * @param humidity Relative humidity percentage (0-100)
 * @returns Dew point in Celsius
 */
export const calculateDewPoint = (tempC: number, humidity: number): number => {
  // Magnus formula constants
  const a = 17.27;
  const b = 237.7;

  const alpha = (a * tempC) / (b + tempC) + Math.log(humidity / 100);
  const dewPoint = (b * alpha) / (a - alpha);

  return Math.round(dewPoint * 10) / 10;
};

/**
 * Calculate heat index (feels like temperature)
 * Only meaningful when temp > 27°C and humidity > 40%
 * @param tempC Temperature in Celsius
 * @param humidity Relative humidity percentage
 * @returns Heat index in Celsius, or null if not applicable
 */
export const calculateHeatIndex = (
  tempC: number,
  humidity: number,
): number | null => {
  // Heat index is only meaningful in warm conditions
  if (tempC < 27 || humidity < 40) {
    return null;
  }

  // Rothfusz regression equation (converted from Fahrenheit formula)
  const T = tempC;
  const RH = humidity;

  const HI =
    -8.785 +
    1.611 * T +
    2.339 * RH -
    0.146 * T * RH -
    0.012 * T * T -
    0.016 * RH * RH +
    0.002 * T * T * RH +
    0.001 * T * RH * RH -
    0.000002 * T * T * RH * RH;

  return Math.round(HI * 10) / 10;
};

/**
 * Get comfort level based on temperature and humidity
 */
export const getComfortLevel = (
  tempC: number,
  humidity: number,
): ComfortLevel => {
  // Temperature zones
  const isCold = tempC < 18;
  const isCool = tempC >= 18 && tempC < 20;
  const isOptimal = tempC >= 20 && tempC <= 24;
  const isWarm = tempC > 24 && tempC <= 26;
  const isHot = tempC > 26;

  // Humidity zones
  const isDry = humidity < 30;
  const isLowHumidity = humidity >= 30 && humidity < 40;
  const isOptimalHumidity = humidity >= 40 && humidity <= 60;
  const isHighHumidity = humidity > 60 && humidity <= 70;
  const isVeryHumid = humidity > 70;

  // Determine comfort level
  if (isOptimal && isOptimalHumidity) {
    return {
      label: 'Comfortable',
      tone: 'success',
      icon: mdiEmoticonHappyOutline,
    };
  }

  if (
    (isOptimal || isCool || isWarm) &&
    (isOptimalHumidity || isLowHumidity || isHighHumidity)
  ) {
    return { label: 'Acceptable', tone: 'accent', icon: mdiEmoticonOutline };
  }

  if (isCold) {
    return { label: 'Too Cold', tone: 'accent', icon: mdiSnowflake };
  }

  if (isHot && isVeryHumid) {
    return { label: 'Hot & Humid', tone: 'danger', icon: mdiWaterAlertOutline };
  }

  if (isHot) {
    return { label: 'Too Hot', tone: 'warning', icon: mdiFire };
  }

  if (isDry) {
    return { label: 'Too Dry', tone: 'warning', icon: mdiWaterOffOutline };
  }

  if (isVeryHumid) {
    return { label: 'Too Humid', tone: 'accent', icon: mdiWaterPercent };
  }

  return {
    label: 'Moderate',
    tone: 'neutral',
    icon: mdiEmoticonNeutralOutline,
  };
};

// ============================================================================
// Light Level Utilities
// ============================================================================

export interface LightLevel {
  label: string;
  tone: Tone;
  recommendation: string;
  icon: string;
}

export const getLightLevel = (lux: number): LightLevel => {
  if (lux < 10) {
    return {
      label: 'Dark',
      tone: 'neutral',
      recommendation: 'Too dark for most activities',
      icon: mdiWeatherNight,
    };
  } else if (lux < 50) {
    return {
      label: 'Dim',
      tone: 'neutral',
      recommendation: 'Low light - suitable for relaxation',
      icon: mdiWeatherNight,
    };
  } else if (lux < 200) {
    return {
      label: 'Low',
      tone: 'accent',
      recommendation: 'Ambient lighting - basic tasks',
      icon: mdiLightbulbOutline,
    };
  } else if (lux < 500) {
    return {
      label: 'Moderate',
      tone: 'accent',
      recommendation: 'Good for general activities',
      icon: mdiWhiteBalanceSunny,
    };
  } else if (lux < 1000) {
    return {
      label: 'Bright',
      tone: 'success',
      recommendation: 'Ideal for reading & detailed work',
      icon: mdiWeatherSunny,
    };
  } else {
    return {
      label: 'Very Bright',
      tone: 'warning',
      recommendation: 'Very bright - may cause glare',
      icon: mdiWeatherSunnyAlert,
    };
  }
};

// ============================================================================
// Activity Log Types
// ============================================================================

export type ActivityEventType =
  | 'presence_on'
  | 'presence_off'
  | 'mmwave_on'
  | 'mmwave_off'
  | 'pir_on'
  | 'pir_off';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: number;
  label: string;
  tone: Tone;
}

export const getActivityEventDetails = (
  type: ActivityEventType,
): { label: string; tone: Tone; icon: string } => {
  switch (type) {
    case 'presence_on':
      return {
        label: 'Presence detected',
        tone: 'success',
        icon: mdiAccountOutline,
      };
    case 'presence_off':
      return {
        label: 'Presence cleared',
        tone: 'neutral',
        icon: mdiAccountOffOutline,
      };
    case 'mmwave_on':
      return {
        label: 'mmWave triggered',
        tone: 'accent',
        icon: mdiAccessPoint,
      };
    case 'mmwave_off':
      return { label: 'mmWave cleared', tone: 'neutral', icon: mdiAccessPoint };
    case 'pir_on':
      return {
        label: 'PIR motion',
        tone: 'accent',
        icon: mdiRecordCircleOutline,
      };
    case 'pir_off':
      return {
        label: 'PIR cleared',
        tone: 'neutral',
        icon: mdiStopCircleOutline,
      };
  }
};

// ============================================================================
// Statistics Utilities
// ============================================================================

export interface DailyStats {
  date: string; // YYYY-MM-DD
  deviceId: string;
  occupancySeconds: number;
  totalSeconds: number;
  tempSum: number;
  tempCount: number;
  tempMin: number | null;
  tempMax: number | null;
  detectionEvents: number;
  lastUpdate: number;
}

export const createEmptyStats = (
  deviceId: string,
  date: string,
): DailyStats => ({
  date,
  deviceId,
  occupancySeconds: 0,
  totalSeconds: 0,
  tempSum: 0,
  tempCount: 0,
  tempMin: null,
  tempMax: null,
  detectionEvents: 0,
  lastUpdate: Date.now(),
});

export const getStatsKey = (deviceId: string, date: string): string => {
  return `ep1_stats_${deviceId}_${date}`;
};

export const getTodayDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
};

export const formatTimeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};
