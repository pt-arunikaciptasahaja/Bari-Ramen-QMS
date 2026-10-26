import test from 'node:test';
import assert from 'node:assert/strict';
import {carouselPage, collectReminders, rowsForHeight, warningLevel} from '../src/lib/tv';
import {normalizePhone} from '../src/lib/queue';

test('carousel includes every waiting number, wraps, and adapts after queue shrinks', () => {
  const all = Array.from({length:27},(_,i)=>i+1);
  const pages = [0,1,2].flatMap(page=>carouselPage(all,page,10).items);
  assert.deepEqual(pages,all);
  assert.deepEqual(carouselPage(all,3,10).items,all.slice(0,10));
  assert.equal(carouselPage([1],2,10).page,0);
  assert.equal(rowsForHeight(1000),10);
  assert.equal(rowsForHeight(240),5);
  assert.equal(rowsForHeight(0),1);
  assert.equal(rowsForHeight(168,56),3);
  assert.deepEqual([0,1,2,3,4].flatMap(page=>carouselPage(all,page,rowsForHeight(168,56)*2).items),all);
});
test('warning colors change at five and ten minutes',()=>{
  const called='2026-10-16T01:00:00Z',start=Date.parse(called);
  assert.equal(warningLevel(called,start+299999),'normal');
  assert.equal(warningLevel(called,start+300000),'warning');
  assert.equal(warningLevel(called,start+600000),'urgent');
});
test('TV rings only for committed server reminders, once, and stops after resolution',()=>{
  const at='2026-10-16T01:00:00Z',start=Date.parse(at);
  const row={id:'one',status:'called',called_at:at,call_count:1};
  let state=collectReminders([row],start,null);
  assert.equal(state.shouldRing,false);
  state=collectReminders([row],start+300000,state.slots);assert.equal(state.shouldRing,false);
  state=collectReminders([{...row,call_count:2}],start+300000,state.slots);assert.equal(state.shouldRing,true);
  state=collectReminders([{...row,call_count:2}],start+301000,state.slots);assert.equal(state.shouldRing,false);
  state=collectReminders([{...row,call_count:3}],start+600000,state.slots);assert.equal(state.shouldRing,true);
  state=collectReminders([{...row,status:'seated'}],start+900000,state.slots);assert.equal(state.shouldRing,false);
  assert.equal(state.slots.size,0);
  assert.equal(collectReminders([{...row,status:'no-show'}],start+900000,state.slots).shouldRing,false);
  assert.equal(collectReminders([{...row,call_count:3}],start+600000,null).shouldRing,false);
});
test('phone normalization accepts local/international numbers and rejects junk',()=>{
  assert.equal(normalizePhone('0812-3456-7890'),'+6281234567890');
  assert.equal(normalizePhone('+62 812 3456 7890'),'+6281234567890');
  assert.equal(normalizePhone('6281234567890'),'+6281234567890');
  assert.equal(normalizePhone(''),null);
  for(const value of ['abc081234567890','12','++6281234567890','628+1234567890','1'.repeat(16)]) assert.throws(()=>normalizePhone(value));
});
