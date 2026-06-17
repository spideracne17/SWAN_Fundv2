/**
 * Seed script for default settings records.
 *
 * Reads default_settings.json and inserts each record into the PocketBase
 * "settings" collection. Existing records with the same key are skipped
 * to support idempotent re-runs.
 *
 * Usage:
 *   npx tsx pocketbase/seeds/seed_settings.ts
 *
 * Requires VITE_POCKETBASE_URL environment variable (or defaults to localhost).
 */

import PocketBase from 'pocketbase';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SettingSeed {
  key: string;
  value: unknown;
  category: string;
  description: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POCKETBASE_URL =
  process.env.VITE_POCKETBASE_URL ?? 'http://127.0.0.1:8090';

const COLLECTION = 'settings';

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pb = new PocketBase(POCKETBASE_URL);

  // Load seed data
  const seedPath = resolve(__dirname, 'default_settings.json');
  const raw = readFileSync(seedPath, 'utf-8');
  const seeds: SettingSeed[] = JSON.parse(raw);

  console.log(
    `Seeding ${seeds.length} default settings into ${POCKETBASE_URL}...`,
  );

  let created = 0;
  let skipped = 0;

  for (const seed of seeds) {
    try {
      // Check if record with this key already exists
      const existing = await pb
        .collection(COLLECTION)
        .getFirstListItem(`key="${seed.key}"`);

      if (existing) {
        console.log(`  ⏭  Skipped (exists): ${seed.key}`);
        skipped++;
        continue;
      }
    } catch {
      // getFirstListItem throws if no record found — that's expected
    }

    try {
      await pb.collection(COLLECTION).create({
        key: seed.key,
        value: JSON.stringify(seed.value),
        category: seed.category,
        description: seed.description,
      });
      console.log(`  ✅ Created: ${seed.key} = ${JSON.stringify(seed.value)}`);
      created++;
    } catch (err) {
      console.error(`  ❌ Failed to create "${seed.key}":`, err);
    }
  }

  console.log(
    `\nDone. Created: ${created}, Skipped: ${skipped}, Total: ${seeds.length}`,
  );
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
