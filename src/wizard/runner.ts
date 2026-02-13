import type { AppConfig } from '../config/schema.js';
import { BackNavigation } from './types.js';
import type { WizardStep, WizardContext } from './types.js';
import { stepHeader, editHeader, divider } from './ui.js';

/**
 * Run the wizard in sequential mode.
 * Steps are filtered by shouldRun(), sorted by order, and executed sequentially.
 * Supports back navigation via BackNavigation sentinel.
 */
export async function runWizard(
  steps: WizardStep[],
  ctx: WizardContext,
): Promise<Partial<AppConfig>> {
  // Filter steps that should run
  const activeSteps = steps
    .filter((s) => !s.shouldRun || s.shouldRun(ctx))
    .sort((a, b) => a.order - b.order);

  let i = 0;
  while (i < activeSteps.length) {
    const step = activeSteps[i];
    stepHeader(i + 1, activeSteps.length, step.title);

    // Offer back navigation for non-first steps
    if (i > 0) {
      const action = await ctx.prompts.select(`${step.title}:`, [
        { name: 'Continue', value: 'continue' },
        { name: '\u2190 Back', value: 'back' },
      ]);
      if (action === 'back') {
        ctx.stepHistory.pop();
        i--;
        continue;
      }
    }

    try {
      await step.run(ctx);
      ctx.stepHistory.push(step.id);
      i++;
    } catch (err) {
      if (err instanceof BackNavigation) {
        if (i > 0) {
          // Pop the previous step from history and go back
          ctx.stepHistory.pop();
          i--;
        }
        // If i === 0, stay at the first step
      } else {
        throw err;
      }
    }
  }

  return ctx.config;
}

/**
 * Run the wizard in edit mode.
 * Shows a menu of steps; user picks which to re-run, then "Review & Save" exits.
 */
export async function runEditMode(
  steps: WizardStep[],
  ctx: WizardContext,
): Promise<Partial<AppConfig>> {
  const editableSteps = steps
    .filter((s) => !s.shouldRun || s.shouldRun(ctx))
    .filter((s) => s.id !== 'welcome' && s.id !== 'summary') // Welcome + Summary not in menu
    .sort((a, b) => a.order - b.order);

  const SAVE_VALUE = '__save__';

  for (;;) {
    divider();
    const choices = [
      ...editableSteps.map((s) => ({ name: s.title, value: s.id })),
      { name: 'Review & Save', value: SAVE_VALUE },
    ];

    const choice = await ctx.prompts.select('Which section do you want to edit?', choices);

    if (choice === SAVE_VALUE) {
      const summaryStep = steps.find((s) => s.id === 'summary');
      if (summaryStep) {
        editHeader(summaryStep.title);
        await summaryStep.run(ctx);
      }
      break;
    }

    const step = editableSteps.find((s) => s.id === choice);
    if (step) {
      editHeader(step.title);
      await step.run(ctx);
    }
  }

  return ctx.config;
}
