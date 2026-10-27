import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJakartaClock } from '../src/lib/jakarta-clock';
import { CUSTOMER_TICKET_KEY, completedTicketDestination, syncCustomerTicket } from '../src/lib/customer-ticket-storage';

test('clock uses Jakarta day/date even when UTC is the previous day',()=>{
  assert.equal(formatJakartaClock(Date.parse('2026-10-27T12:50:00Z')),'Tue, 27 Oct 19:50');
  assert.equal(formatJakartaClock(Date.parse('2026-10-26T17:00:00Z')),'Tue, 27 Oct 00:00');
  assert.equal(formatJakartaClock(Date.parse('2026-10-27T14:30:00Z')),'Tue, 27 Oct 21:30');
  assert.equal(formatJakartaClock(0),'');
});
test('completed visit releases the saved ticket without clearing a newer visit',()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  syncCustomerTicket(storage,'old','waiting',true);
  assert.equal(values.get(CUSTOMER_TICKET_KEY),'old');
  syncCustomerTicket(storage,'old','seated');
  assert.equal(values.has(CUSTOMER_TICKET_KEY),false);
  syncCustomerTicket(storage,'old','called');
  assert.equal(values.has(CUSTOMER_TICKET_KEY),false);
  syncCustomerTicket(storage,'new','waiting',true);
  syncCustomerTicket(storage,'old','seated');
  syncCustomerTicket(storage,'old','called');
  assert.equal(values.get(CUSTOMER_TICKET_KEY),'new');
  syncCustomerTicket(storage,'new','called');
  assert.equal(values.get(CUSTOMER_TICKET_KEY),'new');
});

test('completed, no-show and expired links return to registration; active visits survive refresh',()=>{
  assert.equal(completedTicketDestination('seated',true),'/register?visit=complete');
  assert.equal(completedTicketDestination('no-show',true),'/register?visit=ended');
  assert.equal(completedTicketDestination('called',false),'/register?visit=ended');
  assert.equal(completedTicketDestination('waiting',true),null);
  assert.equal(completedTicketDestination('called',true),null);
  assert.equal(completedTicketDestination('seated',true,'a'.repeat(64)),`/ticket#t=${'a'.repeat(64)}`);
});
