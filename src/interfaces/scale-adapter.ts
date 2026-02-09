import type { Peripheral } from '@abandonware/noble';

export type Gender = 'male' | 'female';

export interface ScaleReading {
  weight: number;
  impedance: number;
}

export interface UserProfile {
  height: number;
  age: number;
  gender: Gender;
  isAthlete: boolean;
}

export interface GarminPayload {
  weight: number;
  impedance: number;
  bmi: number;
  bodyFatPercent: number;
  waterPercent: number;
  boneMass: number;
  muscleMass: number;
  visceralFat: number;
  physiqueRating: number;
  bmr: number;
  metabolicAge: number;
}

export interface ScaleAdapter {
  readonly name: string;
  readonly charNotifyUuid: string;
  readonly charWriteUuid: string;
  readonly unlockCommand: number[];
  readonly unlockIntervalMs: number;
  /** True if parseNotification() already converts any non-kg reading to kg. */
  readonly normalizesWeight?: boolean;

  matches(peripheral: Peripheral): boolean;
  parseNotification(data: Buffer): ScaleReading | null;
  isComplete(reading: ScaleReading): boolean;
  computeMetrics(reading: ScaleReading, profile: UserProfile): GarminPayload;
}
