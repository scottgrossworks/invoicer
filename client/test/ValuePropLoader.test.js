import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  parseValueProp,
  validateTradeAgainstList,
  loadValuePropIdentity
} from '../js/utils/ValuePropLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const realValueProp = readFileSync(resolve(__dirname, '../DOCS/VALUE_PROP.md'), 'utf8');

// Minimal valid fixture for edge-case tests.
const minimalVP = `## THE PRODUCT

**Trade:** caricatures

**Product Name:** Test Co

**Seller:** Jane Doe

**Email:** jane@example.com

**Phone:** 555 123 4567

---

## THE PITCH

We do a thing.

---

## OUTREACH

### Signature

Jane Doe
555 123 4567

### Sample Email

Hi there, book us.

---

## Thank-You

Thanks for booking.
`;

// Fake fetch that resolves trades from a provided list.
function fakeTradesFetch(trades) {
  return async () => ({ ok: true, json: async () => trades });
}

describe('parseValueProp (real VALUE_PROP.md)', () => {
  const bi = parseValueProp(realValueProp);

  it('parses required identity fields', () => {
    expect(bi.trade).toBe('caricatures');
    expect(bi.sellerName).toBe('Scott Gross');
    expect(bi.companyName).toBe('That Drawing Show with Scott Gross');
    expect(bi.companyEmail).toBe('drawingshowscott@gmail.com');
    expect(bi.companyPhone).toBe('3109801421');
  });

  it('normalizes the phone to digits only', () => {
    expect(bi.companyPhone).toBe('3109801421');
  });

  it('parses the literal sections', () => {
    expect(bi.pitch.length).toBeGreaterThan(0);
    expect(bi.signature.length).toBeGreaterThan(0);
    expect(bi.sampleOutreach.length).toBeGreaterThan(0);
    expect(bi.thankYouTemplate.length).toBeGreaterThan(0);
    // Sample email body should not contain the stray "## Outreach" heading line.
    expect(bi.sampleOutreach).not.toMatch(/^#/m);
  });

  it('records no blocking errors for the real file', () => {
    expect(bi.errors).toEqual([]);
  });

  it('builds excludedEmails from seller email plus legacy shim', () => {
    expect(bi.excludedEmails).toContain('drawingshowscott@gmail.com');
    expect(bi.excludedEmails).toContain('scottgrossworks@gmail.com');
  });

  it('builds excludedPhones from the seller phone', () => {
    expect(bi.excludedPhones).toContain('3109801421');
  });

  it('extracts contact handle and service-area zips', () => {
    expect(bi.contactHandle).toBe('@thatdrawingshow');
    expect(bi.serviceAreaZips).toContain('90012');
  });

  it('has empty forbiddenPhrases when the section is absent', () => {
    expect(bi.forbiddenPhrases).toEqual([]);
  });
});

describe('parseValueProp (edge cases)', () => {
  it('flags TRADE_MISSING when **Trade:** is absent', () => {
    const bi = parseValueProp(minimalVP.replace('**Trade:** caricatures', '**Trade:**'));
    expect(bi.errors.some(e => e.startsWith('TRADE_MISSING'))).toBe(true);
  });

  it('flags a missing required field', () => {
    const bi = parseValueProp(minimalVP.replace('**Email:** jane@example.com', ''));
    expect(bi.errors.some(e => e.includes('**Email:**'))).toBe(true);
  });

  it('parses AltEmails into excludedEmails', () => {
    const vp = minimalVP.replace(
      '**Email:** jane@example.com',
      '**Email:** jane@example.com\n\n**AltEmails:** jane.alt@example.com, jane2@example.com'
    );
    const bi = parseValueProp(vp);
    expect(bi.excludedEmails).toContain('jane.alt@example.com');
    expect(bi.excludedEmails).toContain('jane2@example.com');
  });

  it('reports empty/unreadable input as a blocking error', () => {
    const bi = parseValueProp('');
    expect(bi.errors.length).toBeGreaterThan(0);
  });
});

describe('validateTradeAgainstList', () => {
  it('resolves a matching trade case-insensitively', async () => {
    const r = await validateTradeAgainstList('Caricatures', 'https://api', fakeTradesFetch([{ sk: 'caricatures' }, { sk: 'dj' }]));
    expect(r.canonicalTrade).toBe('caricatures');
    expect(r.tradeUnverified).toBe(false);
    expect(r.error).toBeNull();
  });

  it('emits the exact TRADE_UNRESOLVED string on a definitive no-match', async () => {
    const r = await validateTradeAgainstList('banana', 'https://api', fakeTradesFetch([{ sk: 'caricatures' }, { sk: 'dj' }]));
    expect(r.error).toBe('TRADE_UNRESOLVED: VALUE_PROP **Trade:** value "banana" is not in the canonical marketplace trade list.');
    expect(r.canonicalTrade).toBeNull();
    expect(r.tradeUnverified).toBe(false);
  });

  it('degrades to tradeUnverified (no blocking error) on fetch failure', async () => {
    const throwingFetch = async () => { throw new Error('network down'); };
    const r = await validateTradeAgainstList('caricatures', 'https://api', throwingFetch);
    expect(r.tradeUnverified).toBe(true);
    expect(r.error).toBeNull();
  });
});

describe('loadValuePropIdentity (orchestration)', () => {
  function fakeFetch({ md, trades, failTrades }) {
    return async (url) => {
      if (String(url).endsWith('getTrades')) {
        if (failTrades) throw new Error('trades down');
        return { ok: true, json: async () => trades };
      }
      return { ok: true, text: async () => md };
    };
  }
  const cfg = { aws: { apiGatewayUrl: 'https://api/stage' } };

  it('loads, parses, and resolves the trade', async () => {
    const bi = await loadValuePropIdentity(cfg, {
      fetchImpl: fakeFetch({ md: minimalVP, trades: [{ sk: 'caricatures' }] }),
      getUrl: (p) => p
    });
    expect(bi.trade).toBe('caricatures');
    expect(bi.canonicalTrade).toBe('caricatures');
    expect(bi.errors).toEqual([]);
    expect(bi.loadedAt).toBeGreaterThan(0);
  });

  it('marks tradeUnverified (no block) when getTrades is unreachable', async () => {
    const bi = await loadValuePropIdentity(cfg, {
      fetchImpl: fakeFetch({ md: minimalVP, failTrades: true }),
      getUrl: (p) => p
    });
    expect(bi.trade).toBe('caricatures');
    expect(bi.tradeUnverified).toBe(true);
    expect(bi.errors).toEqual([]);
    expect(bi.warnings.some(w => w.startsWith('TRADE_UNVERIFIED'))).toBe(true);
  });

  it('reports VALUE_PROP_LOAD_FAILED when the file cannot be fetched', async () => {
    const failingFetch = async () => { throw new Error('404'); };
    const bi = await loadValuePropIdentity(cfg, { fetchImpl: failingFetch, getUrl: (p) => p });
    expect(bi.errors.some(e => e.startsWith('VALUE_PROP_LOAD_FAILED'))).toBe(true);
  });
});
