import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');

async function applySplit() {
  const lots = await pb.collection('tax_lots').getFullList({ filter: 'symbol="VGT"' });
  console.log('VGT lots found:', lots.length);
  
  for (const lot of lots) {
    const oldShares = parseFloat(lot.remaining_shares) || 0;
    const oldCost = parseFloat(lot.cost_per_share) || 0;
    const oldAcquired = parseFloat(lot.shares_acquired) || 0;
    
    await pb.collection('tax_lots').update(lot.id, {
      remaining_shares: String(oldShares * 8),
      shares_acquired: String(oldAcquired * 8),
      cost_per_share: String(oldCost / 8),
    });
    console.log('Split:', lot.id, oldShares, '->', oldShares * 8, 'shares, cost:', oldCost, '->', oldCost / 8);
  }
  console.log('Done — VGT 8:1 split applied');
}

applySplit();
