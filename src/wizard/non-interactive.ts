import { readFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AppConfigSchema, formatConfigError } from '../config/schema.js';
import { resolveEnvReferences } from '../config/load.js';
import { generateSlug } from '../config/slugify.js';
import { atomicWrite } from '../config/write.js';
import { createLogger } from '../logger.js';

const log = createLogger('Wizard');

/**
 * Non-interactive mode: load existing YAML, validate, auto-generate missing slugs,
 * resolve ${ENV_VAR} references, and write back atomically.
 */
export async function runNonInteractive(configPath: string): Promise<void> {
  log.info(`Validating ${configPath} (non-interactive mode)...`);

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch {
    log.error(`Cannot read config file: ${configPath}`);
    process.exit(1);
  }

  const parsed = parseYaml(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    log.error('Config file is not a valid YAML object');
    process.exit(1);
  }

  // Auto-generate missing slugs
  let modified = false;
  const users = parsed.users as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(users)) {
    for (const user of users) {
      if (!user.slug && user.name) {
        user.slug = generateSlug(String(user.name));
        log.info(`Auto-generated slug '${user.slug}' for user '${user.name}'`);
        modified = true;
      }
    }
  }

  // Resolve env references
  const resolved = resolveEnvReferences(parsed);

  // Validate with Zod
  const result = AppConfigSchema.safeParse(resolved);
  if (!result.success) {
    const msg = formatConfigError(result.error);
    log.error(msg);
    process.exit(1);
  }

  log.info('Config is valid.');
  log.info(`  Users: ${result.data.users.length}`);
  log.info(
    `  Exporters: ${(result.data.global_exporters ?? []).length} global, ${result.data.users.reduce((sum, u) => sum + (u.exporters ?? []).length, 0)} per-user`,
  );

  // Check if Zod applied any defaults that differ from the original
  const enriched = JSON.stringify(result.data) !== JSON.stringify(resolved);

  // Write back if slugs were auto-generated or Zod enriched defaults
  if (modified || enriched) {
    const output = stringifyYaml(modified ? parsed : result.data, { lineWidth: 0 });
    atomicWrite(configPath, output);
    log.info(
      `Updated ${configPath}${modified ? ' with auto-generated slugs' : ' with schema defaults'}.`,
    );
  }
}
