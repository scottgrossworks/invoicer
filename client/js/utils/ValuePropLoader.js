/**
 * ValuePropLoader - Runtime business identity loader.
 *
 * Business identity is sourced from client/DOCS/VALUE_PROP.md at runtime and held
 * only in STATE.BusinessIdentity. It is NEVER persisted to SQLite / Prisma Config /
 * /config / durable chrome storage (see plan KTD1/R2). Parsing is procedural and
 * deterministic (KTD2) - the LLM is not involved.
 *
 * Exports are split so the pure markdown parser is unit-testable without chrome/fetch:
 *   - parseValueProp(markdown)            -> BusinessIdentity (no network)
 *   - validateTradeAgainstList(...)       -> { canonicalTrade, tradeUnverified, error }
 *   - loadValuePropIdentity(leedzConfig)  -> orchestrates fetch + parse + validate
 */

const SOURCE_PATH = 'DOCS/VALUE_PROP.md';

// One-time migration shim: the parser prompts historically excluded this address while
// VALUE_PROP declares drawingshowscott@gmail.com. Prefer declaring extra seller addresses
// under a **AltEmails:** line in VALUE_PROP.md.
// TODO: remove once AltEmails is populated in VALUE_PROP.md (see plan U1 / KTD1).
const LEGACY_SELLER_EMAIL = 'scottgrossworks@gmail.com';

const REQUIRED_FIELDS = ['Trade', 'Product Name', 'Seller', 'Email', 'Phone'];

/**
 * Build an empty BusinessIdentity object with safe defaults.
 * @returns {object}
 */
export function emptyBusinessIdentity() {
  return {
    trade: null,
    canonicalTrade: null,
    sellerName: null,
    companyName: null,
    companyEmail: null,
    companyPhone: null,
    websiteUrl: null,
    contactHandle: null,
    geography: [],
    serviceAreaZips: [],
    excludedEmails: [],
    excludedPhones: [],
    pitch: '',
    ratesDescription: '',
    signature: '',
    sampleOutreach: '',
    thankYouTemplate: '',
    forbiddenPhrases: [],
    sourcePath: SOURCE_PATH,
    loadedAt: null,
    tradeUnverified: false,
    errors: [],    // blocking errors (gate Share/Write)
    warnings: []   // non-blocking notices (render but never gate)
  };
}

/** Digits-only normalization for phones. */
function normalizePhone(value) {
  return value ? String(value).replace(/\D/g, '') : '';
}

/** Lowercase+trim normalization for emails. */
function normalizeEmail(value) {
  return value ? String(value).toLowerCase().trim() : '';
}

/**
 * Parse the bold `**Key:** value` fields from the document into a map keyed by the
 * exact label (e.g. "Trade", "Product Name").
 * @param {string} markdown
 * @returns {Object<string,string>}
 */
function parseBoldFields(markdown) {
  const fields = {};
  const re = /^\*\*\s*([^:*]+?)\s*:\*\*\s*(.*)$/;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const m = rawLine.match(re);
    if (m) {
      const key = m[1].trim();
      const value = m[2].trim();
      // First occurrence wins (THE PRODUCT block is authoritative).
      if (!(key in fields)) fields[key] = value;
    }
  }
  return fields;
}

/**
 * Split the document into `---`-delimited blocks, classified by their first `##` heading.
 * Sections in VALUE_PROP.md are separated by horizontal rules, which is more robust than
 * trying to bound headings against each other (the Sample Email contains a stray heading).
 * @param {string} markdown
 * @returns {Object<string,string[]>} lowercased-heading -> block lines (heading line removed)
 */
function parseBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = {};
  let current = null;
  let headingKey = null;

  const flush = () => {
    if (headingKey && current) blocks[headingKey] = current;
    current = null;
    headingKey = null;
  };

  for (const line of lines) {
    if (line.trim() === '---') {
      flush();
      continue;
    }
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2 && !line.startsWith('###')) {
      // A new top-level section heading starts a fresh block unless we're already
      // inside one (a stray `## Outreach` inside Sample Email must not reset OUTREACH).
      if (!headingKey) {
        headingKey = h2[1].trim().toLowerCase();
        current = [];
        continue;
      }
    }
    if (headingKey) current.push(line);
  }
  flush();
  return blocks;
}

/** Collapse leading/trailing blank lines and strip any markdown heading lines. */
function cleanSectionText(lines) {
  if (!lines) return '';
  const kept = lines.filter(l => !/^#{1,6}\s/.test(l));
  // Trim leading/trailing blank lines but preserve internal blank lines.
  let start = 0;
  let end = kept.length - 1;
  while (start <= end && kept[start].trim() === '') start++;
  while (end >= start && kept[end].trim() === '') end--;
  return kept.slice(start, end + 1).join('\n');
}

/**
 * Extract the ### Signature and ### Sample Email subsections from the OUTREACH block.
 * @param {string[]} outreachLines
 * @returns {{signature: string, sampleOutreach: string}}
 */
function parseOutreachSubsections(outreachLines) {
  if (!outreachLines) return { signature: '', sampleOutreach: '' };
  let sigStart = -1;
  let sampleStart = -1;
  outreachLines.forEach((l, i) => {
    if (/^###\s+signature\s*$/i.test(l)) sigStart = i;
    else if (/^###\s+sample\s+email\s*$/i.test(l)) sampleStart = i;
  });
  const signature = sigStart >= 0
    ? cleanSectionText(outreachLines.slice(sigStart + 1, sampleStart >= 0 ? sampleStart : undefined))
    : '';
  const sampleOutreach = sampleStart >= 0
    ? cleanSectionText(outreachLines.slice(sampleStart + 1))
    : '';
  return { signature, sampleOutreach };
}

/** Pull bullet phrases out of a FORBIDDEN PHRASES block. */
function parseBulletList(lines) {
  if (!lines) return [];
  return lines
    .map(l => l.match(/^[-*]\s+(.*)$/))
    .filter(Boolean)
    .map(m => m[1].trim())
    .filter(Boolean);
}

/** Split a comma/semicolon-delimited field into a trimmed, non-empty array. */
function splitList(value) {
  if (!value) return [];
  return value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

/**
 * Parse VALUE_PROP markdown into a BusinessIdentity object. Pure: no network, no chrome.
 * Records blocking errors for missing required fields and missing/blank trade.
 * @param {string} markdown
 * @returns {object} BusinessIdentity (trade not yet validated against the marketplace list)
 */
export function parseValueProp(markdown) {
  const bi = emptyBusinessIdentity();
  if (!markdown || !markdown.trim()) {
    bi.errors.push('VALUE_PROP_EMPTY: VALUE_PROP.md is empty or unreadable.');
    return bi;
  }

  const fields = parseBoldFields(markdown);
  const blocks = parseBlocks(markdown);

  // Required-field presence check.
  for (const field of REQUIRED_FIELDS) {
    const v = fields[field];
    if (!v || !v.trim()) {
      if (field === 'Trade') {
        bi.errors.push('TRADE_MISSING: VALUE_PROP **Trade:** is missing or blank.');
      } else {
        bi.errors.push(`MISSING_FIELD: **${field}:** is required in VALUE_PROP.md.`);
      }
    }
  }

  // Identity fields.
  bi.trade = fields['Trade'] ? fields['Trade'].trim() : null;
  bi.companyName = fields['Product Name'] || null;
  bi.sellerName = fields['Seller'] || null;
  bi.companyEmail = fields['Email'] ? normalizeEmail(fields['Email']) : null;
  bi.companyPhone = fields['Phone'] ? normalizePhone(fields['Phone']) : null;
  bi.websiteUrl = fields['Website'] || null;
  bi.ratesDescription = fields['Rate'] || '';
  bi.geography = splitList(fields['Geography']);

  // Contact handle: first @handle found in **Socials:**.
  if (fields['Socials']) {
    const handle = fields['Socials'].match(/@[\w.]+/);
    if (handle) bi.contactHandle = handle[0];
  }

  // Exclusion lists: seller email + optional **AltEmails:** + legacy shim; seller phone.
  const emails = new Set();
  if (bi.companyEmail) emails.add(bi.companyEmail);
  for (const e of splitList(fields['AltEmails'])) emails.add(normalizeEmail(e));
  emails.add(LEGACY_SELLER_EMAIL);
  bi.excludedEmails = [...emails].filter(Boolean);
  bi.excludedPhones = bi.companyPhone ? [bi.companyPhone] : [];

  // Literal sections.
  bi.pitch = cleanSectionText(blocks['the pitch']);
  bi.thankYouTemplate = cleanSectionText(blocks['thank-you']);
  const { signature, sampleOutreach } = parseOutreachSubsections(blocks['outreach']);
  bi.signature = signature;
  bi.sampleOutreach = sampleOutreach;
  bi.forbiddenPhrases = parseBulletList(blocks['forbidden phrases']);

  // Service-area zips: any 5-digit token in the SERVICE AREA DETAILS block.
  const areaText = (blocks['service area details'] || []).join('\n');
  bi.serviceAreaZips = [...new Set((areaText.match(/\b\d{5}\b/g) || []))];

  return bi;
}

/**
 * Validate a trade value against the marketplace canonical list (AWS getTrades).
 * Network failures degrade to tradeUnverified (never TRADE_UNRESOLVED) per KTD3 - a
 * no-match is undecidable offline.
 * @param {string} trade
 * @param {string} apiGatewayUrl - base URL, e.g. leedzConfig.aws.apiGatewayUrl
 * @param {function} fetchImpl - injectable fetch (defaults to global fetch)
 * @returns {Promise<{canonicalTrade: string|null, tradeUnverified: boolean, error: string|null}>}
 */
export async function validateTradeAgainstList(trade, apiGatewayUrl, fetchImpl = globalThis.fetch) {
  if (!trade || !trade.trim()) {
    return { canonicalTrade: null, tradeUnverified: false, error: null };
  }
  if (!apiGatewayUrl || typeof fetchImpl !== 'function') {
    return { canonicalTrade: null, tradeUnverified: true, error: null };
  }
  const url = `${apiGatewayUrl.replace(/\/$/, '')}/getTrades`;
  try {
    const res = await fetchImpl(url);
    if (!res || !res.ok) throw new Error(`getTrades HTTP ${res ? res.status : 'no-response'}`);
    const trades = await res.json();
    const want = trade.trim().toLowerCase();
    const match = (Array.isArray(trades) ? trades : [])
      .find(t => t && typeof t.sk === 'string' && t.sk.trim().toLowerCase() === want);
    if (match) {
      return { canonicalTrade: match.sk, tradeUnverified: false, error: null };
    }
    return {
      canonicalTrade: null,
      tradeUnverified: false,
      error: `TRADE_UNRESOLVED: VALUE_PROP **Trade:** value "${trade}" is not in the canonical marketplace trade list.`
    };
  } catch (_e) {
    // Offline / server down: cannot decide no-match, so degrade to unverified.
    return { canonicalTrade: null, tradeUnverified: true, error: null };
  }
}

/**
 * Load and parse VALUE_PROP.md, then validate the trade against the marketplace list.
 * Runtime entry point called from sidebar startup.
 * @param {object} leedzConfig - parsed leedz_config.json (uses aws.apiGatewayUrl)
 * @param {object} [deps] - injectable { fetchImpl, getUrl } for testing
 * @returns {Promise<object>} BusinessIdentity with loadedAt/errors/warnings populated
 */
export async function loadValuePropIdentity(leedzConfig, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const getUrl = deps.getUrl
    || (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
      ? (p) => chrome.runtime.getURL(p)
      : (p) => p);

  let markdown = '';
  try {
    const res = await fetchImpl(getUrl(SOURCE_PATH));
    if (!res || !res.ok) throw new Error(`VALUE_PROP HTTP ${res ? res.status : 'no-response'}`);
    markdown = await res.text();
  } catch (e) {
    const bi = emptyBusinessIdentity();
    bi.errors.push(`VALUE_PROP_LOAD_FAILED: could not fetch ${SOURCE_PATH} (${e.message}).`);
    return bi;
  }

  const bi = parseValueProp(markdown);

  // Trade validation against the marketplace list.
  const apiGatewayUrl = leedzConfig && leedzConfig.aws ? leedzConfig.aws.apiGatewayUrl : null;
  const { canonicalTrade, tradeUnverified, error } =
    await validateTradeAgainstList(bi.trade, apiGatewayUrl, fetchImpl);
  bi.canonicalTrade = canonicalTrade;
  bi.tradeUnverified = tradeUnverified;
  if (error) bi.errors.push(error);
  if (tradeUnverified && bi.trade) {
    bi.warnings.push(`TRADE_UNVERIFIED: could not reach the marketplace to verify trade "${bi.trade}".`);
  }

  bi.loadedAt = Date.now();
  return bi;
}
