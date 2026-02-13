import chalk from 'chalk';
import boxen from 'boxen';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

const LOGO = `
  ____  _      _____   ____            _        ____
 | __ )| |    | ____| / ___|  ___ __ _| | ___  / ___|_   _ _ __   ___
 |  _ \\| |    |  _|   \\___ \\ / __/ _\` | |/ _ \\ \\___ | | | | '_ \\ / __|
 | |_) | |___ | |___   ___) | (_| (_| | |  __/  ___) | |_| | | | | (__
 |____/|_____|_____| |____/ \\___\\__,_|_|\\___| |____/ \\__, |_| |_|\\___|
                                                      |___/`;

export function banner(): void {
  console.log(chalk.cyan(LOGO));
  console.log(
    chalk.bold(`  v${pkg.version}`) +
      chalk.dim(' — Interactive setup wizard') +
      '  by ' +
      chalk.bold.cyan('Kristian Partl') +
      '\n',
  );
}

export function stepHeader(num: number, total: number, title: string): void {
  console.log(
    `\n${chalk.bold.blue(`Step ${num}/${total}`)} ${chalk.dim('—')} ${chalk.bold(title)}`,
  );
  console.log(chalk.dim('─'.repeat(50)));
}

export function editHeader(title: string): void {
  console.log(`\n${chalk.bold.blue('Editing:')} ${chalk.bold(title)}`);
  console.log(chalk.dim('─'.repeat(50)));
}

export function success(msg: string): string {
  return chalk.green(`\u2714  ${msg}`);
}

export function warn(msg: string): string {
  return chalk.yellow(`\u26A0  ${msg}`);
}

export function error(msg: string): string {
  return chalk.red(`\u2718  ${msg}`);
}

export function info(msg: string): string {
  return chalk.blue(`\u2139  ${msg}`);
}

export function dim(msg: string): string {
  return chalk.dim(msg);
}

export function sectionBox(title: string, content: string): string {
  return boxen(content, {
    title: chalk.dim(title),
    borderStyle: 'round',
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: 'gray',
  });
}

export function divider(): void {
  console.log(chalk.dim('─'.repeat(50)));
}
