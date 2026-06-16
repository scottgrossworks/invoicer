/**
 * IdentityFilter - shared seller-identity filter for all parsers.
 *
 * Removes the seller's own identity from extracted client candidates, sourced from
 * STATE.BusinessIdentity (DOCS/VALUE_PROP.md). This is the single filter applied across
 * EventParser, ProfileParser, and ClientParser (plan U8/U9), replacing the Gmail-only
 * ValidationUtils.isUserIdentity path. Pure functions - no DOM, no chrome.
 */

const normEmail = (e) => (e ? String(e).toLowerCase().trim() : '');
const normPhone = (p) => (p ? String(p).replace(/\D/g, '') : '');
const normName = (n) => (n ? String(n).toLowerCase().replace(/\s+/g, ' ').trim() : '');

/** Build a Set of normalized, non-empty values. */
function normalizedSet(values, normFn) {
  const set = new Set();
  for (const v of values) {
    const n = normFn(v);
    if (n) set.add(n);
  }
  return set;
}

/**
 * Is the candidate the seller's own identity (and therefore not a client)?
 * Matches on email, phone (digits-only), or name.
 * @param {{name?:string,email?:string,phone?:string,company?:string,website?:string,clientNotes?:string}} candidate
 * @param {object} businessIdentity - STATE.BusinessIdentity
 * @returns {boolean}
 */
export function isBusinessIdentity(candidate, businessIdentity) {
  if (!candidate || !businessIdentity) return false;
  const bi = businessIdentity;

  const cEmail = normEmail(candidate.email);
  if (cEmail) {
    const emails = normalizedSet([bi.companyEmail, ...(bi.excludedEmails || [])], normEmail);
    if (emails.has(cEmail)) return true;
  }

  const cPhone = normPhone(candidate.phone);
  if (cPhone) {
    const phones = normalizedSet([bi.companyPhone, ...(bi.excludedPhones || [])], normPhone);
    if (phones.has(cPhone)) return true;
  }

  const cName = normName(candidate.name);
  if (cName) {
    const names = normalizedSet([bi.sellerName, bi.companyName], normName);
    if (names.has(cName)) return true;
  }

  return false;
}

/**
 * Return a new array with the seller's own identity removed.
 * Falls through unchanged when no business identity is available (do not over-filter).
 * @param {Array<object>} clients
 * @param {object} businessIdentity
 * @returns {Array<object>}
 */
export function filterClientsAgainstBusinessIdentity(clients, businessIdentity) {
  if (!Array.isArray(clients)) return [];
  if (!businessIdentity) return clients.slice();
  return clients.filter((c) => c && !isBusinessIdentity(c, businessIdentity));
}
