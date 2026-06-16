import { describe, it, expect } from 'vitest';
import {
  isBusinessIdentity,
  filterClientsAgainstBusinessIdentity
} from '../js/utils/IdentityFilter.js';

const bi = {
  sellerName: 'Scott Gross',
  companyName: 'That Drawing Show with Scott Gross',
  companyEmail: 'drawingshowscott@gmail.com',
  companyPhone: '3109801421',
  excludedEmails: ['drawingshowscott@gmail.com', 'scottgrossworks@gmail.com'],
  excludedPhones: ['3109801421']
};

describe('isBusinessIdentity (U8)', () => {
  it('matches the seller email', () => {
    expect(isBusinessIdentity({ email: 'drawingshowscott@gmail.com' }, bi)).toBe(true);
  });

  it('matches the legacy seller email from excludedEmails', () => {
    expect(isBusinessIdentity({ email: 'SCOTTGROSSWORKS@gmail.com' }, bi)).toBe(true);
  });

  it('matches the seller phone regardless of formatting', () => {
    expect(isBusinessIdentity({ phone: '(310) 980-1421' }, bi)).toBe(true);
  });

  it('matches the seller name (case/space-insensitive)', () => {
    expect(isBusinessIdentity({ name: '  scott   gross ' }, bi)).toBe(true);
  });

  it('does not match an unrelated name', () => {
    expect(isBusinessIdentity({ name: 'Cynthia Lee' }, bi)).toBe(false);
  });

  it('does not match a real client', () => {
    expect(isBusinessIdentity({ name: 'Laura Martinez', email: 'laura@company.com', phone: '5551234567' }, bi)).toBe(false);
  });

  it('does not false-positive on empty/whitespace fields', () => {
    expect(isBusinessIdentity({ name: '', email: '', phone: '' }, bi)).toBe(false);
    expect(isBusinessIdentity({ name: '   ' }, bi)).toBe(false);
  });

  it('returns false when no business identity is provided', () => {
    expect(isBusinessIdentity({ email: 'drawingshowscott@gmail.com' }, null)).toBe(false);
  });
});

describe('filterClientsAgainstBusinessIdentity (U8)', () => {
  it('removes the seller and keeps real clients', () => {
    const clients = [
      { name: 'Scott Gross', email: 'drawingshowscott@gmail.com' },
      { name: 'Laura Martinez', email: 'laura@company.com' }
    ];
    const result = filterClientsAgainstBusinessIdentity(clients, bi);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Laura Martinez');
  });

  it('passes clients through unchanged when identity is missing', () => {
    const clients = [{ name: 'Scott Gross' }];
    expect(filterClientsAgainstBusinessIdentity(clients, null)).toEqual(clients);
  });

  it('handles a non-array input safely', () => {
    expect(filterClientsAgainstBusinessIdentity(undefined, bi)).toEqual([]);
  });
});
