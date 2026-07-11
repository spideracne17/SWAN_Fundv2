/**
 * Setup PocketBase collections with proper fields for v0.23+
 * Run: node schwab/setup-db.mjs
 */
import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');

await pb.collection('_superusers').authWithPassword('admin@investmentworkbook.local', 'admin123456');

// Delete existing collections (reverse order for relations)
const existing = await pb.collections.getFullList();
for (const col of existing) {
  if (col.name.startsWith('_') || col.name === 'users') continue;
  try { await pb.collections.delete(col.id); console.log('Deleted:', col.name); } catch {}
}

// Create accounts collection with proper fields
await pb.collections.create({
  name: 'accounts', type: 'base',
  listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  fields: [
    { name: 'id', type: 'text', primaryKey: true, system: true, required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}', hidden: false },
    { name: 'name', type: 'text', required: true, hidden: false },
    { name: 'broker', type: 'text', required: true, hidden: false },
    { name: 'account_type', type: 'text', required: true, hidden: false },
    { name: 'account_number_last4', type: 'text', required: true, hidden: false },
    { name: 'tax_status', type: 'text', required: true, hidden: false },
    { name: 'is_active', type: 'bool', hidden: false },
    { name: 'default_lot_method', type: 'text', required: true, hidden: false },
  ],
});
console.log('Created: accounts');

// Create tax_lots
await pb.collections.create({
  name: 'tax_lots', type: 'base',
  listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  fields: [
    { name: 'id', type: 'text', primaryKey: true, system: true, required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}', hidden: false },
    { name: 'account_id', type: 'text', required: true, hidden: false },
    { name: 'symbol', type: 'text', required: true, hidden: false },
    { name: 'acquisition_date', type: 'text', required: true, hidden: false },
    { name: 'shares_acquired', type: 'number', required: true, hidden: false },
    { name: 'remaining_shares', type: 'number', required: true, hidden: false },
    { name: 'cost_per_share', type: 'number', required: true, hidden: false },
    { name: 'total_cost_basis', type: 'number', required: true, hidden: false },
    { name: 'acquisition_type', type: 'text', required: true, hidden: false },
    { name: 'status', type: 'text', required: true, hidden: false },
    { name: 'fees', type: 'number', hidden: false },
    { name: 'source_transaction_hash', type: 'text', hidden: false },
    { name: 'drip_source_dividend_id', type: 'text', hidden: false },
  ],
});
console.log('Created: tax_lots');

// Create cash_transactions
await pb.collections.create({
  name: 'cash_transactions', type: 'base',
  listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  fields: [
    { name: 'id', type: 'text', primaryKey: true, system: true, required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}', hidden: false },
    { name: 'account_id', type: 'text', required: true, hidden: false },
    { name: 'transaction_date', type: 'text', required: true, hidden: false },
    { name: 'transaction_type', type: 'text', required: true, hidden: false },
    { name: 'symbol', type: 'text', hidden: false },
    { name: 'description', type: 'text', hidden: false },
    { name: 'quantity', type: 'number', hidden: false },
    { name: 'price_per_unit', type: 'number', hidden: false },
    { name: 'total_amount', type: 'number', required: true, hidden: false },
    { name: 'fees', type: 'number', hidden: false },
    { name: 'source_format', type: 'text', hidden: false },
    { name: 'raw_action', type: 'text', hidden: false },
    { name: 'hash', type: 'text', hidden: false },
  ],
});
console.log('Created: cash_transactions');

// Create csv_import_log
await pb.collections.create({
  name: 'csv_import_log', type: 'base',
  listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  fields: [
    { name: 'id', type: 'text', primaryKey: true, system: true, required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}', hidden: false },
    { name: 'filename', type: 'text', required: true, hidden: false },
    { name: 'format_detected', type: 'text', required: true, hidden: false },
    { name: 'account_id', type: 'text', required: true, hidden: false },
    { name: 'import_date', type: 'text', required: true, hidden: false },
    { name: 'records_total', type: 'number', required: true, hidden: false },
    { name: 'records_new', type: 'number', required: true, hidden: false },
    { name: 'records_duplicate', type: 'number', required: true, hidden: false },
    { name: 'records_error', type: 'number', required: true, hidden: false },
    { name: 'file_hash', type: 'text', required: true, hidden: false },
    { name: 'backup_generated', type: 'bool', hidden: false },
  ],
});
console.log('Created: csv_import_log');

// Create dividends
await pb.collections.create({
  name: 'dividends', type: 'base',
  listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  fields: [
    { name: 'id', type: 'text', primaryKey: true, system: true, required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}', hidden: false },
    { name: 'account_id', type: 'text', required: true, hidden: false },
    { name: 'symbol', type: 'text', required: true, hidden: false },
    { name: 'ex_date', type: 'text', required: true, hidden: false },
    { name: 'pay_date', type: 'text', required: true, hidden: false },
    { name: 'amount_per_share', type: 'number', hidden: false },
    { name: 'total_amount', type: 'number', required: true, hidden: false },
    { name: 'shares_held_at_ex', type: 'number', hidden: false },
    { name: 'classification', type: 'text', hidden: false },
    { name: 'is_drip', type: 'bool', hidden: false },
    { name: 'tax_year', type: 'number', hidden: false },
    { name: 'source_transaction_hash', type: 'text', hidden: false },
  ],
});
console.log('Created: dividends');

// Create dispositions
await pb.collections.create({
  name: 'dispositions', type: 'base',
  listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  fields: [
    { name: 'id', type: 'text', primaryKey: true, system: true, required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}', hidden: false },
    { name: 'lot_id', type: 'text', required: true, hidden: false },
    { name: 'disposition_date', type: 'text', required: true, hidden: false },
    { name: 'shares_disposed', type: 'number', required: true, hidden: false },
    { name: 'proceeds_per_share', type: 'number', required: true, hidden: false },
    { name: 'cost_basis_per_share', type: 'number', required: true, hidden: false },
    { name: 'gain_loss', type: 'number', required: true, hidden: false },
    { name: 'holding_period', type: 'text', required: true, hidden: false },
    { name: 'wash_sale_disallowed', type: 'number', hidden: false },
  ],
});
console.log('Created: dispositions');

// Seed accounts
const accounts = [
  { name: 'Schwab Spreads', broker: 'schwab', account_type: 'taxable', account_number_last4: '0626', tax_status: 'taxable', is_active: true, default_lot_method: 'fifo' },
  { name: 'Robinhood Traditional IRA', broker: 'robinhood', account_type: 'traditional_ira', account_number_last4: '0002', tax_status: 'tax_deferred', is_active: true, default_lot_method: 'fifo' },
  { name: 'Schwab Roth IRA', broker: 'schwab', account_type: 'roth_ira', account_number_last4: '0212', tax_status: 'tax_free', is_active: true, default_lot_method: 'fifo' },
  { name: 'Schwab Traditional IRA', broker: 'schwab', account_type: 'traditional_ira', account_number_last4: '0617', tax_status: 'tax_deferred', is_active: true, default_lot_method: 'fifo' },
];

for (const a of accounts) {
  await pb.collection('accounts').create(a);
  console.log('Seeded account:', a.name);
}

console.log('\n✅ Database setup complete. You can now import CSVs.');
