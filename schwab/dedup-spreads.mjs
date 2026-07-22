import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');

const SPREADS_ACCOUNT_ID = '562upqkz5ba4e16';

const all = await pb.collection('cash_transactions').getFullList({
  filter: `account_id="${SPREADS_ACCOUNT_ID}"`,
  sort: 'transaction_date',
});

console.log('Total spreads txns before:', all.length);

const seen = new Set();
let deleted = 0;

for (const r of all) {
  const key = r.hash || `${r.transaction_date}_${r.raw_action}_${r.symbol}_${r.total_amount}`;
  if (seen.has(key)) {
    await pb.collection('cash_transactions').delete(r.id);
    deleted++;
  } else {
    seen.add(key);
  }
}

console.log('Deleted duplicates:', deleted);

const remaining = await pb.collection('cash_transactions').getFullList({
  filter: `account_id="${SPREADS_ACCOUNT_ID}"`,
});
console.log('Remaining:', remaining.length);
