import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root, regardless of where the CLI is invoked from. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function fromRoot(...segments: string[]): string {
  return path.resolve(ROOT, ...segments);
}

/** Writes via a temporary file so a crash never leaves a half-written file behind. */
export function writeFileAtomic(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, content, 'utf8');
  renameSync(temporary, file);
}

export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}
