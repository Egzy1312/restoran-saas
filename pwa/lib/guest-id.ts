/**
 * Anonimni identifikator gosta - generise se jednom po uredjaju/browseru i
 * cuva u localStorage. Nema registracije/login-a (vidi specifikaciju modul A) -
 * ovaj id sluzi samo da se u zajednickoj korpi stola zna ko je dodao koju
 * stavku (za "split by item" kasnije) i za attribution u narudzbi.
 */
const STORAGE_KEY = 'restoran_guest_id';

export function getGuestId(): string {
  if (typeof window === 'undefined') return '';

  let guestId = window.localStorage.getItem(STORAGE_KEY);
  if (!guestId) {
    guestId = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, guestId);
  }
  return guestId;
}
