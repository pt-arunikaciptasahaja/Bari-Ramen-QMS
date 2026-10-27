export const CUSTOMER_TICKET_KEY = 'bari-customer-ticket-v1';
type TicketStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
/** Release only this ticket; an old tab must never clear a newer visit. */
export function syncCustomerTicket(storage: TicketStorage, token: string, status: string, claim = false) {
  const saved = storage.getItem(CUSTOMER_TICKET_KEY);
  if (status === 'seated' || status === 'no-show') {
    if (saved === token) storage.removeItem(CUSTOMER_TICKET_KEY);
  } else if ((status === 'waiting' || status === 'called') && (claim || !saved || saved === token)) {
    storage.setItem(CUSTOMER_TICKET_KEY,token);
  }
}
