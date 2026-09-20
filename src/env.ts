import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Load .env from the project root (no-op if absent). Node 20.12+ builtin. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // no .env yet — fine
}
