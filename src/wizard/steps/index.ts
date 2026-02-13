import type { WizardStep } from '../types.js';
import { welcomeStep } from './welcome.js';
import { usersStep } from './users.js';
import { bleStep } from './ble.js';
import { exportersStep } from './exporters.js';
import { garminAuthStep } from './garmin-auth.js';
import { runtimeStep } from './runtime.js';
import { validateStep } from './validate.js';
import { summaryStep } from './summary.js';

export const WIZARD_STEPS: WizardStep[] = [
  welcomeStep,
  usersStep,
  bleStep,
  exportersStep,
  garminAuthStep,
  runtimeStep,
  validateStep,
  summaryStep,
].sort((a, b) => a.order - b.order);
