/**
 * Full PocketBase schema setup matching the original pb_schema.json
 * but with hidden:false for v0.23+ field visibility
 */
import PocketBase from 'pocketbase';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pb = new PocketBase('http://127.0.0.1:8090');
await pb.collection('_superusers').authWithPassword('admin@investmentworkbook.local', 'admin123456');

const schema = JSON.parse(readFileSync(resolve(__dirname, '../pocketbase/migrations/pb_schema.json'), 'utf-8'));

// Map old schema field types to PB v0.23 format
function mapField(f) {
  const base = { name: f.name, hidden: false, presentable: false };
  
  switch (f.type) {
    case 'text':
      return { ...base, type: 'text', min: 0, max: f.options?.max || 500 };
    case 'number':
      return { ...base, type: 'number', min: null, max: null };
    case 'bool':
      return { ...base, type: 'bool' };
    case 'date':
      return { ...base, type: 'text', min: 0, max: 100 }; // Store dates as text for simplicity
    case 'select':
      return { ...base, type: 'text', min: 0, max: 100 }; // Store selects as text
    case 'json':
      return { ...base, type: 'json', maxSize: 0 };
    case 'relation':
      return { ...base, type: 'text', min: 0, max: 100 }; // Store relations as text IDs
    default:
      return { ...base, type: 'text', min: 0, max: 500 };
  }
}

// ID field required by PB v0.23
const idField = {
  name: 'id', type: 'text', primaryKey: true, system: true, required: true,
  min: 15, max: 15, pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}', hidden: false
};

for (const col of schema) {
  const fields = [idField, ...col.schema.map(mapField)];
  try {
    await pb.collections.create({
      name: col.name,
      type: col.type || 'base',
      listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
      fields,
    });
    console.log('Created:', col.name, `(${col.schema.length} fields)`);
  } catch (e) {
    console.error('Failed:', col.name, e.response?.data || e.message);
  }
}

// Seed accounts with correct names
const accounts = [
  { name: 'Schwab Spreads', broker: 'schwab', account_type: 'taxable', account_number_last4: '0626', tax_status: 'taxable', is_active: true, default_lot_method: 'fifo' },
  { name: 'Robinhood', broker: 'robinhood', account_type: 'traditional_ira', account_number_last4: '0002', tax_status: 'tax_deferred', is_active: true, default_lot_method: 'fifo' },
  { name: 'Schwab Roth IRA', broker: 'schwab', account_type: 'roth_ira', account_number_last4: '0212', tax_status: 'tax_free', is_active: true, default_lot_method: 'fifo' },
  { name: 'Schwab Traditional IRA', broker: 'schwab', account_type: 'traditional_ira', account_number_last4: '0617', tax_status: 'tax_deferred', is_active: true, default_lot_method: 'fifo' },
];

for (const a of accounts) {
  try {
    await pb.collection('accounts').create(a);
    console.log('Seeded:', a.name);
  } catch (e) {
    console.error('Seed failed:', a.name, e.response?.data || e.message);
  }
}

console.log('\n✅ Done. Refresh the app and try importing.');
