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

// Generic/shared-inbox local-part words (mirrors PRECRIME's isGenericEmail concept):
// an email like events4@csun.edu is a MAILBOX, not a person. Trailing digits allowed.
const GENERIC_LOCALPART_RE = new RegExp(
  '^(?:info|sales|contact|contacts|hello|admin|office|support|team|events?|booking|bookings|' +
  'inquir(?:y|ies)|enquir(?:y|ies)|mail|marketing|hr|jobs|press|media|help|services?|' +
  'reservations?|frontdesk|reception|no-?reply|donotreply)[-._]?\\d*$', 'i'
);

/**
 * Is this header-derived identity WEAK — a shared/generic inbox rather than a person?
 * Weak when the email local-part is a generic mailbox word (events4@, info@, ...) OR the
 * display name is just the mailbox label restated ("USU Events4" ~ usuevents4@csun.edu).
 * A weak identity may be OVERRIDDEN by an LLM-found person name from the signature block
 * (the "USU Events4 vs John Pangan" failure, 2026-07-22).
 * @param {string} name
 * @param {string} email
 * @returns {boolean}
 */
export function isWeakIdentity(name, email) {
  const localPart = normEmail(email).split('@')[0] || '';
  if (localPart && GENERIC_LOCALPART_RE.test(localPart)) return true;

  // Name restates the mailbox label ("USU Events4" ~ usuevents4@) — but ONLY
  // when the name is not a plausible person name: a personal first.last@ email
  // naturally matches its owner's name ("Yasmine Perez" ~ yasmine.perez@) and
  // must NOT be treated as weak.
  if (isPlausiblePersonName(name)) return false;

  const squashedName = normName(name).replace(/[^a-z0-9]/g, '');
  const squashedLocal = localPart.replace(/[^a-z0-9]/g, '');
  if (squashedName && squashedLocal && (
    squashedName === squashedLocal ||
    squashedLocal.includes(squashedName) ||
    squashedName.includes(squashedLocal)
  )) return true;

  return false;
}

/**
 * Does this look like a real PERSON's name (usable to override a weak identity)?
 * Two+ alphabetic words, none of them generic mailbox words.
 * @param {string} name
 * @returns {boolean}
 */
export function isPlausiblePersonName(name) {
  const n = normName(name);
  if (!n) return false;
  const words = n.split(' ');
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) =>
    /^[a-z'’.-]+$/.test(w) && !GENERIC_LOCALPART_RE.test(w)
  );
}
