import PocketBase from 'pocketbase';
const pb = new PocketBase('http://100.91.148.82:8090');

await pb.collection('_superusers').authWithPassword('admin@investmentworkbook.local', 'admin123456');
console.log('Authenticated');

// Create user (skip if exists)
try {
  await pb.collections.update('users', { createRule: '' });
  await pb.collection('users').create({ email: 'user@example.com', password: 'password123456', passwordConfirm: 'password123456', emailVisibility: true });
  console.log('User created');
} catch(e) { console.log('User already exists or error, skipping:', e.message?.slice(0,50)); }

// Helper
const idField = { name: 'id', type: 'text', primaryKey: true, system: true, required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}', hidden: false };
async function mkCol(name, fieldNames) {
  try {
    const fields = [idField, ...fieldNames.map(n => ({ name: n, type: 'text', hidden: false, presentable: false }))];
    await pb.collections.create({ name, type: 'base', listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '', fields });
    console.log('Created:', name);
  } catch(e) { console.log('Skip:', name, e.message?.slice(0,40)); }
}

await mkCol('accounts', ['name','broker','account_type','account_number_last4','tax_status','is_active','default_lot_method']);
await mkCol('tax_lots', ['account_id','symbol','instrument_id','acquisition_date','settlement_date','shares_acquired','remaining_shares','cost_per_share','total_cost_basis','acquisition_type','status','fees','source_transaction_hash','drip_source_dividend_id','split_adjusted','original_shares','original_cost_per_share']);
await mkCol('cash_transactions', ['account_id','transaction_date','settlement_date','transaction_type','symbol','description','quantity','price_per_unit','total_amount','fees','source_format','raw_action','hash']);
await mkCol('csv_import_log', ['filename','format_detected','account_id','import_date','records_total','records_new','records_duplicate','records_error','errors','file_hash','backup_generated']);
await mkCol('dividends', ['account_id','symbol','ex_date','pay_date','record_date','amount_per_share','total_amount','shares_held_at_ex','classification','is_drip','drip_lot_id','tax_year','form_1099_amount','source_transaction_hash']);
await mkCol('dispositions', ['lot_id','disposition_date','shares_disposed','proceeds_per_share','cost_basis_per_share','gain_loss','holding_period','wash_sale_disallowed']);
await mkCol('option_positions', ['account_id','underlying_symbol','option_symbol','option_type','direction','strike_price','expiration_date','contracts','premium_per_contract','total_premium','status','spread_id','roll_chain_id','opened_date','closed_date','close_premium','pnl','assignment_lot_id','source_transaction_hash']);
await mkCol('option_spreads', ['spread_type','short_leg_id','long_leg_id','underlying_symbol','net_credit','max_loss','collateral_required','breakeven','status']);
await mkCol('instruments', ['symbol','name','instrument_type','underlying_symbol']);
await mkCol('settings', ['key','value','category','description']);
await mkCol('stock_splits', ['symbol','split_date','ratio_from','ratio_to','effective_date','lots_adjusted','applied','applied_date']);
await mkCol('ira_contributions', ['account_id','tax_year','contribution_date','amount','contribution_type','source']);
await mkCol('sweep_balances', ['account_id','balance_date','amount','currency']);
await mkCol('market_events', ['event_date','event_type','vix_level','spx_price','spx_50dma','spx_200dma','iv_rank','market_color','notes']);

// Seed accounts
const accts = [
  { name: 'Schwab Spreads', broker: 'schwab', account_type: 'taxable', account_number_last4: '0626', tax_status: 'taxable', is_active: 'true', default_lot_method: 'fifo' },
  { name: 'Robinhood', broker: 'robinhood', account_type: 'traditional_ira', account_number_last4: '0002', tax_status: 'tax_deferred', is_active: 'true', default_lot_method: 'fifo' },
  { name: 'Schwab Roth IRA', broker: 'schwab', account_type: 'roth_ira', account_number_last4: '0212', tax_status: 'tax_free', is_active: 'true', default_lot_method: 'fifo' },
  { name: 'Schwab Traditional IRA', broker: 'schwab', account_type: 'traditional_ira', account_number_last4: '0617', tax_status: 'tax_deferred', is_active: 'true', default_lot_method: 'fifo' },
];
for (const a of accts) {
  try {
    await pb.collection('accounts').create(a);
    console.log('Seeded:', a.name);
  } catch(e) { console.log('Skip seed:', a.name, e.message?.slice(0,40)); }
}

console.log('\n✅ Unraid PocketBase setup complete!');
