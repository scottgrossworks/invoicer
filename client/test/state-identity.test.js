import { describe, it, expect } from 'vitest';
import { StateFactory } from '../js/state.js';

const sampleBI = {
  sellerName: 'Scott Gross',
  companyEmail: 'drawingshowscott@gmail.com',
  companyPhone: '3109801421',
  trade: 'caricatures',
  canonicalTrade: 'caricatures',
  errors: [],
  warnings: [],
  loadedAt: 1710000000000
};

describe('State BusinessIdentity serialization (U2 / KTD12 / R2)', () => {
  it('toObject() includes BusinessIdentity (crosses to content-script parsers)', async () => {
    const s = await StateFactory.create_blank();
    s.BusinessIdentity = sampleBI;
    expect(s.toObject().BusinessIdentity).toEqual(sampleBI);
  });

  it('toPersistedObject() excludes BusinessIdentity (never persisted - R2)', async () => {
    const s = await StateFactory.create_blank();
    s.BusinessIdentity = sampleBI;
    expect(s.toPersistedObject().BusinessIdentity).toBeUndefined();
  });

  it('fromObject() restores BusinessIdentity when the payload carries it', async () => {
    const s = await StateFactory.create_blank();
    s.fromObject({ Clients: [], Booking: {}, Config: {}, BusinessIdentity: sampleBI });
    expect(s.BusinessIdentity).toEqual(sampleBI);
  });

  it('fromObject() without BusinessIdentity preserves existing identity (clear does not wipe)', async () => {
    const s = await StateFactory.create_blank();
    s.BusinessIdentity = sampleBI;
    s.fromObject({ Clients: [{ name: 'A Client' }], Booking: {}, Config: {} }); // DB record, no identity
    expect(s.BusinessIdentity).toEqual(sampleBI);
  });

  it('isIdentityBlocked() reflects null / errors / loadedAt', async () => {
    const s = await StateFactory.create_blank();
    expect(s.isIdentityBlocked()).toBe(true); // null identity
    s.BusinessIdentity = { errors: [], warnings: [], loadedAt: 1 };
    expect(s.isIdentityBlocked()).toBe(false);
    s.BusinessIdentity = { errors: ['TRADE_MISSING: ...'], warnings: [], loadedAt: 1 };
    expect(s.isIdentityBlocked()).toBe(true); // blocking error
    s.BusinessIdentity = { errors: [], warnings: ['TRADE_UNVERIFIED'], loadedAt: 1 };
    expect(s.isIdentityBlocked()).toBe(false); // warning is non-blocking
    s.BusinessIdentity = { errors: [], warnings: [], loadedAt: null };
    expect(s.isIdentityBlocked()).toBe(true); // not yet loaded
  });
});
