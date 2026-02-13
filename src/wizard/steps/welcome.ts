import { existsSync } from 'node:fs';
import type { WizardStep, WizardContext } from '../types.js';
import { banner, dim } from '../ui.js';

export const welcomeStep: WizardStep = {
  id: 'welcome',
  title: 'Welcome',
  order: 10,

  async run(ctx: WizardContext): Promise<void> {
    banner();

    console.log(dim('  Before you start, make sure you have:'));
    console.log(dim('    - Your scale nearby (powered on)'));
    console.log(dim('    - Garmin credentials (if using Garmin export)'));
    console.log(dim('    - MQTT/InfluxDB/Webhook/Ntfy details (if using those exporters)\n'));

    // Check for existing config
    if (existsSync(ctx.configPath)) {
      const action = await ctx.prompts.select(
        'An existing config.yaml was found. What would you like to do?',
        [
          { name: 'Edit existing configuration', value: 'edit' },
          { name: 'Start fresh (overwrite)', value: 'fresh' },
        ],
      );

      if (action === 'edit') {
        ctx.isEditMode = true;
        return;
      }
    }
  },
};
