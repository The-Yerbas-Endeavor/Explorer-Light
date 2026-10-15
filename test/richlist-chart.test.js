import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const context = vm.createContext({ addressLabel: () => '', compactHash: value => value });
vm.runInContext(source.slice(source.indexOf('function richlistDistribution('), source.indexOf('function richlistChart(')), context);
const distribute = context.richlistDistribution;
test('distribution uses all top-100 balances and groups ranks 11–100 exactly', () => {
  const items = Array.from({length:100}, (_, i) => ({rank:i+1,address:'address'+i,balanceSatoshis:'9007199254740993'}));
  const data = distribute(items);
  assert.equal(data.total,900719925474099300n);
  assert.equal(data.slices.length,11);
  assert.equal(data.slices[0].percent,'1.00');
  assert.equal(data.slices[10].percent,'90.00');
  assert.equal(data.slices[10].balance,9007199254740993n*90n);
  assert.equal(data.slices.reduce((sum,item)=>sum+item.balance,0n),data.total);
});
test('empty and single-address snapshots produce valid distributions', () => {
  assert.equal(distribute([]).slices.length,0);
  assert.equal(distribute([{rank:1,address:'a',balanceSatoshis:'0'}]).slices.length,0);
  const single = distribute([{rank:1,address:'a',balanceSatoshis:'1'}]);
  assert.equal(single.slices.length,1);
  assert.equal(single.slices[0].fraction,1);
  assert.equal(single.slices[0].percent,'100.00');
});
