import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJakartaClock } from '../src/lib/jakarta-clock';
import { CUSTOMER_TICKET_KEY, syncCustomerTicket } from '../src/lib/customer-ticket-storage';

test('clock uses Jakarta day/date even when UTC is the previous day',()=>{
  assert.equal(formatJakartaClock(Date.parse('2026-10-27T12:50:00Z')),'Tue, 27-10-26, 19:50');
  assert.equal(formatJakartaClock(Date.parse('2026-10-26T17:00:00Z')),'Tue, 27-10-26, 00:00');
  assert.equal(formatJakartaClock(0),'');
});
test('completed visit releases the saved ticket without clearing a newer visit',()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  syncCustomerTicket(storage,'old','waiting',true);
  assert.equal(values.get(CUSTOMER_TICKET_KEY),'old');
  syncCustomerTicket(storage,'old','seated');
  assert.equal(values.has(CUSTOMER_TICKET_KEY),false);
  syncCustomerTicket(storage,'new','waiting',true);
  syncCustomerTicket(storage,'old','seated');
  syncCustomerTicket(storage,'old','called');
  assert.equal(values.get(CUSTOMER_TICKET_KEY),'new');
  syncCustomerTicket(storage,'new','called');
  assert.equal(values.get(CUSTOMER_TICKET_KEY),'new');
});
