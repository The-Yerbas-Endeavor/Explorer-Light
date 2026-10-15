import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const context = vm.createContext({ addressLabel: () => '', compactHash: value => value });
vm.runInContext(source.slice(source.indexOf('function richlistDistribution('), source.indexOf('function richlistChart(')), context);
const distribute = context.richlistDistribution;
test('distribution uses total supply and groups ranks 11–100 exactly', () => {
  const items = Array.from({length:100}, (_, i) => ({rank:i+1,address:'address'+i,balanceSatoshis:'9007199254740993'}));
  const data = distribute(items, '1801439850948198600');
  assert.equal(data.total,1801439850948198600n);
  assert.equal(data.slices.length,12);
  assert.equal(data.slices[0].percent,'0.50');
  assert.equal(data.slices[10].percent,'45.00');
  assert.equal(data.slices[10].balance,9007199254740993n*90n);
  assert.equal(data.slices[11].percent,'50.00');
  assert.equal(data.slices[11].label,'Remaining supply');
  assert.equal(data.slices.reduce((sum,item)=>sum+item.balance,0n),data.total);
});
test('empty and single-address snapshots produce valid distributions', () => {
  assert.equal(distribute([], '0').slices.length,0);
  assert.equal(distribute([{rank:1,address:'a',balanceSatoshis:'0'}], '0').slices.length,0);
  const single = distribute([{rank:1,address:'a',balanceSatoshis:'1'}], '1');
  assert.equal(single.slices.length,1);
  assert.equal(single.slices[0].fraction,1);
  assert.equal(single.slices[0].percent,'100.00');
});

test('rejects inconsistent supply instead of showing misleading percentages', () => {
  assert.throws(() => distribute([{rank:1,address:'a',balanceSatoshis:'2'}], '1'));
});
