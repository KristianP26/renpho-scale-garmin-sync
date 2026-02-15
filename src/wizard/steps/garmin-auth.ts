import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { WizardStep, WizardContext } from '../types.js';
import type { UserConfig, ExporterEntry } from '../../config/schema.js';
import { success, error, warn, dim } from '../ui.js';

const __dirname: string = dirname(fileURLToPath(import.meta.url));
const ROOT: string = join(__dirname, '..', '..', '..');

interface GarminUser {
  userName: string;
  entry: ExporterEntry;
}

function getUsersWithGarmin(ctx: WizardContext): GarminUser[] {
  const results: GarminUser[] = [];

  // Global garmin entries apply to all users
  for (const e of ctx.config.global_exporters ?? []) {
    if (e.type === 'garmin') {
      for (const u of ctx.config.users ?? []) {
        results.push({ userName: (u as UserConfig).name, entry: e });
      }
    }
  }

  // Per-user garmin entries
  for (const u of ctx.config.users ?? []) {
    const user = u as UserConfig;
    for (const e of user.exporters ?? []) {
      if ((e as ExporterEntry).type === 'garmin') {
        results.push({ userName: user.name, entry: e as ExporterEntry });
      }
    }
  }

  return results;
}

function runSetupGarmin(
  pythonCmd: string,
  email?: string,
  password?: string,
  tokenDir?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const scriptPath = join(ROOT, 'garmin-scripts', 'setup_garmin.py');
    const args: string[] = [scriptPath];

    if (email) {
      args.push('--email', email);
    }
    if (password) {
      args.push('--password', password);
    }
    if (tokenDir) {
      // Expand ~ to home directory
      const expandedTokenDir = tokenDir.replace(
        /^~/,
        process.env.HOME || process.env.USERPROFILE || '',
      );
      args.push('--token-dir', expandedTokenDir);
    }

    const proc = spawn(pythonCmd, args, {
      stdio: 'inherit',
      timeout: 120_000,
    });

    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

export const garminAuthStep: WizardStep = {
  id: 'garmin-auth',
  title: 'Garmin Authentication',
  order: 50,

  shouldRun(ctx: WizardContext): boolean {
    return getUsersWithGarmin(ctx).length > 0;
  },

  async run(ctx: WizardContext): Promise<void> {
    if (!ctx.platform.hasPython || !ctx.platform.pythonCommand) {
      console.log(`\n  ${dim('Python is not available — skipping Garmin authentication.')}`);
      console.log(dim('  You can run it later with: npm run setup-garmin\n'));
      return;
    }

    const garminUsers = getUsersWithGarmin(ctx);

    // Check token_dir uniqueness
    const tokenDirs = garminUsers
      .map((g) => (g.entry as Record<string, unknown>).token_dir as string | undefined)
      .filter(Boolean) as string[];
    const duplicates = tokenDirs.filter((d, i) => tokenDirs.indexOf(d) !== i);
    if (duplicates.length > 0) {
      console.log(
        `\n  ${warn(`Duplicate token_dir detected: ${[...new Set(duplicates)].join(', ')}`)}`,
      );
      console.log(warn('  Each user should have a unique token_dir to avoid auth conflicts.\n'));
    }

    // Per-user auth loop
    for (const { userName, entry } of garminUsers) {
      const runAuth = await ctx.prompts.confirm(
        `Run Garmin auth for ${userName}? (requires email + password)`,
        { default: true },
      );

      if (!runAuth) {
        console.log(dim(`  Skipped ${userName}. Run later with: npm run setup-garmin`));
        continue;
      }

      // Extract credentials and token_dir from the entry
      const entryRecord = entry as Record<string, unknown>;
      const email = entryRecord.email as string | undefined;
      const password = entryRecord.password as string | undefined;
      const tokenDir = entryRecord.token_dir as string | undefined;

      if (!email || !password) {
        console.log(
          `\n  ${error(`Garmin auth failed for ${userName}: email and password are required in config.`)}`,
        );
        continue;
      }

      console.log(`\n  Running Garmin setup for ${userName}...\n`);

      let authOk = await runSetupGarmin(ctx.platform.pythonCommand, email, password, tokenDir);

      if (!authOk) {
        const retry = await ctx.prompts.confirm(`Garmin auth failed for ${userName}. Retry?`, {
          default: true,
        });
        if (retry) {
          authOk = await runSetupGarmin(ctx.platform.pythonCommand, email, password, tokenDir);
        }
      }

      if (authOk) {
        console.log(`\n  ${success(`Garmin authentication successful for ${userName}!`)}`);
      } else {
        console.log(
          `\n  ${error(`Garmin auth failed for ${userName}. You can retry later with: npm run setup-garmin`)}`,
        );
      }
    }
  },
};

// Exported for testing
export { getUsersWithGarmin };
