/**
 * Seed script for default account records.
 *
 * Reads default_accounts.json and inserts each record into the PocketBase
 * "accounts" collection. Existing records with the same name are skipped
 * to support idempotent re-runs.
 *
 * Usage:
 *   npx tsx pocketbase/seeds/seed_accounts.ts
 *
 * Requires VITE_POCKETBASE_URL environment variable (or defaults to localhost).
 */

import PocketBase from 'pocketbase';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AccountSeed {
  name: string;
  broker: string;
  account_type: string;
  account_number_last4: string;
  tax_status: string;
  is_active: boolean;
  default_lot_method: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POCKETBASE_URL =
  process.env.VITE_POCKETBASE_URL ?? 'http://127.0.0.1:8090';

const COLLECTION = 'accounts';

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pb = new PocketBase(POCKETBASE_URL);

  // Load seed data
  const seedPath = resolve(__dirname, 'default_accounts.json');
  const raw = readFileSync(seedPath, 'utf-8');
  const seeds: AccountSeed[] = JSON.parse(raw);

  console.log(
    `Seeding ${seeds.length} default accounts into ${POCKETBASE_URL}...`,
  );

  let created = 0;
  let skipped = 0;

  for (const seed of seeds) {
    try {
      // Check if record with this name already exists
      const existing = await pb
        .collection(COLLECTION)
        .getFirstListItem(`name="${seed.name}"`);

      if (existing) {
        console.log(`  ⏭  Skipped (exists): ${seed.name}`);
        skipped++;
        continue;
      }
    } catch {
      // getFirstListItem throws if no record found — that's expected
    }

    try {
      await pb.collection(COLLECTION).create({
        name: seed.name,
        broker: seed.broker,
        account_type: seed.account_type,
        account_number_last4: seed.account_number_last4,
        tax_status: seed.tax_status,
        is_active: seed.is_active,
        default_lot_method: seed.default_lot_method,
      });
      console.log(`  ✅ Created: ${seed.name}`);
      created++;
    } catch (err) {
      console.error(`  ❌ Failed to create "${seed.name}":`, err);
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
