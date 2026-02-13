import type { WizardStep, WizardContext } from '../types.js';
import { generateSlug, validateSlugUniqueness } from '../../config/slugify.js';
import type { UserConfig } from '../../config/schema.js';
import { success, warn, dim } from '../ui.js';

interface PartialUser {
  name: string;
  slug: string;
  height: number;
  birth_date: string;
  gender: 'male' | 'female';
  is_athlete: boolean;
  weight_range: { min: number; max: number };
  last_known_weight: null;
}

function validateDate(v: string): string | true {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Must be YYYY-MM-DD format';
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return 'Invalid date';
  }
  if (date > new Date()) return 'Birth date cannot be in the future';
  return true;
}

function validatePositiveNumber(v: string): string | true {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 'Must be a positive number';
  return true;
}

async function promptUser(ctx: WizardContext, existingSlugs: string[]): Promise<PartialUser> {
  const { prompts, config } = ctx;

  const name = await prompts.input('User name:', {
    validate: (v) => (v.trim().length > 0 ? true : 'Name is required'),
  });

  // Slug generation with preview
  const autoSlug = generateSlug(name);
  console.log(`  ${dim(`Auto-generated slug: ${autoSlug}`)}`);

  const slug = await prompts.input('Slug (press Enter to accept):', {
    default: autoSlug,
    validate: (v) => {
      if (!/^[a-z0-9-]+$/.test(v)) {
        return 'Slug must contain only lowercase letters, numbers, and hyphens';
      }
      if ([...existingSlugs, ...getAllSlugs(ctx)].includes(v)) {
        return `Slug '${v}' is already in use`;
      }
      return true;
    },
  });

  const weightUnit = config.scale?.weight_unit ?? 'kg';
  const heightUnit = config.scale?.height_unit ?? 'cm';

  const heightLabel = heightUnit === 'in' ? 'Height (inches):' : 'Height (cm):';
  const heightStr = await prompts.input(heightLabel, { validate: validatePositiveNumber });
  const height = Number(heightStr);

  const birth_date = await prompts.input('Birth date (YYYY-MM-DD):', { validate: validateDate });

  const gender = await prompts.select<'male' | 'female'>('Gender:', [
    { name: 'Male', value: 'male' },
    { name: 'Female', value: 'female' },
  ]);

  const is_athlete = await prompts.confirm('Athlete mode? (adjusts body composition formulas)', {
    default: false,
  });

  // Weight range
  const unitLabel = weightUnit === 'lbs' ? 'lbs' : 'kg';
  const minStr = await prompts.input(`Weight range minimum (${unitLabel}):`, {
    validate: validatePositiveNumber,
  });
  const maxStr = await prompts.input(`Weight range maximum (${unitLabel}):`, {
    validate: (v) => {
      const result = validatePositiveNumber(v);
      if (result !== true) return result;
      if (Number(v) <= Number(minStr)) return 'Max must be greater than min';
      return true;
    },
  });

  let min = Number(minStr);
  let max = Number(maxStr);

  // Convert lbs to kg for storage
  if (weightUnit === 'lbs') {
    min = Math.round((min / 2.20462) * 100) / 100;
    max = Math.round((max / 2.20462) * 100) / 100;
    console.log(dim(`  \u2192 stored as ${min}\u2013${max} kg`));
  }

  const weight_range = { min, max };

  return {
    name,
    slug,
    height,
    birth_date,
    gender,
    is_athlete,
    weight_range,
    last_known_weight: null,
  };
}

function getAllSlugs(ctx: WizardContext): string[] {
  const users = ctx.config.users as PartialUser[] | undefined;
  return users ? users.map((u) => u.slug) : [];
}

export const usersStep: WizardStep = {
  id: 'users',
  title: 'User Profiles',
  order: 30,

  async run(ctx: WizardContext): Promise<void> {
    const users: PartialUser[] = [];

    console.log('\nSet up user profiles (you can add multiple users):\n');

    // First user is always required
    const firstUser = await promptUser(ctx, []);
    users.push(firstUser);

    // Additional users
    for (;;) {
      const addMore = await ctx.prompts.confirm('Add another user?', { default: false });
      if (!addMore) break;

      const existingSlugs = users.map((u) => u.slug);
      const user = await promptUser(ctx, existingSlugs);
      users.push(user);
    }

    // Validate slug uniqueness
    const slugs = users.map((u) => u.slug);
    const duplicates = validateSlugUniqueness(slugs);
    if (duplicates.length > 0) {
      console.log(`\n${warn(`Duplicate slugs detected: ${duplicates.join(', ')}`)}`);
    }

    ctx.config.users = users as UserConfig[];

    console.log(
      `\n  ${success(`${users.length} user(s) configured: ${users.map((u) => u.name).join(', ')}`)}`,
    );
  },
};

// Exported for testing
export { validateDate, validatePositiveNumber, promptUser };
export type { PartialUser };
