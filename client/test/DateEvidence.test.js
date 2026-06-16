import { describe, it, expect } from 'vitest';
import {
  verifyDateInBody,
  verifyTimeInBody,
  validateEventEpochs,
  verifyBookingExtraction,
  parseTimeString,
  wallClockEpochUtc,
  resolveEventDates
} from '../js/utils/DateEvidence.js';

const base2026 = new Date(Date.UTC(2026, 0, 1));
const baseMay2026 = new Date(Date.UTC(2026, 4, 23));

describe('verifyDateInBody (ported from share_helpers)', () => {
  it('accepts a short month-name match', () => {
    expect(verifyDateInBody('2026-09-20', 'Booked for Sept 20.', base2026)).toBe(true);
  });
  it('accepts a long month-name match with year', () => {
    expect(verifyDateInBody('2026-09-20', 'Booked for September 20, 2026.', base2026)).toBe(true);
  });
  it('accepts a numeric slash match', () => {
    expect(verifyDateInBody('2026-09-20', 'See you 9/20.', base2026)).toBe(true);
  });
  it('accepts an ISO match', () => {
    expect(verifyDateInBody('2026-09-20', 'Confirmed 2026-09-20.', base2026)).toBe(true);
  });
  it('rejects when the date is absent', () => {
    expect(verifyDateInBody('2026-09-20', 'No date here.', base2026)).toBe(false);
  });
  it('rejects a future-year date whose year is not in the source', () => {
    expect(verifyDateInBody('2027-05-01', 'Booked for May 1.', baseMay2026)).toBe(false);
  });
  it('accepts a future-year date when the year is explicit in the source', () => {
    expect(verifyDateInBody('2027-05-01', 'Booked for May 1, 2027.', baseMay2026)).toBe(true);
  });
});

describe('verifyTimeInBody (ported from share_helpers)', () => {
  it('accepts compact pm', () => {
    expect(verifyTimeInBody('7:00 PM', 'Starts at 7pm.')).toBe(true);
  });
  it('accepts dotted p.m.', () => {
    expect(verifyTimeInBody('7:00 PM', 'Starts at 7 p.m.')).toBe(true);
  });
  it('accepts 24-hour evidence', () => {
    expect(verifyTimeInBody('7:00 PM', 'Starts at 19:00.')).toBe(true);
  });
  it('rejects a different hour', () => {
    expect(verifyTimeInBody('7:00 PM', 'Starts at 6pm.')).toBe(false);
  });
  it('accepts noon / midnight special cases', () => {
    expect(verifyTimeInBody('12:00 PM', 'starts at noon')).toBe(true);
    expect(verifyTimeInBody('12:00 AM', 'at midnight')).toBe(true);
  });
});

describe('parseTimeString', () => {
  it('parses 24h and 12h forms', () => {
    expect(parseTimeString('19:00')).toEqual([19, 0]);
    expect(parseTimeString('7:00 PM')).toEqual([19, 0]);
    expect(parseTimeString('7 pm')).toEqual([19, 0]);
  });
  it('returns null for invalid input', () => {
    expect(parseTimeString('not a time')).toBeNull();
    expect(parseTimeString('')).toBeNull();
  });
});

describe('validateEventEpochs', () => {
  const now = Date.now();
  it('passes a valid future event', () => {
    expect(validateEventEpochs(now + 86400000, now + 90000000, now)).toBeNull();
  });
  it('flags a past start', () => {
    expect(validateEventEpochs(now - 86400000, now - 80000000, now)).toBe('start_in_past');
  });
  it('flags end not after start', () => {
    expect(validateEventEpochs(now + 86400000, now + 86400000 - 1000, now)).toBe('end_not_after_start');
  });
});

describe('wallClockEpochUtc', () => {
  it('builds a UTC epoch', () => {
    expect(wallClockEpochUtc(2026, 9, 20, 19, 0)).toBe(Date.UTC(2026, 8, 20, 19, 0));
  });
});

describe('verifyBookingExtraction (INVOICER nested shape)', () => {
  it('verifies a nested Booking.startDate (flat startDate not required)', () => {
    const r = verifyBookingExtraction(
      { Client: {}, Booking: { startDate: '2026-09-20' } },
      'Booked for Sept 20.',
      { baseDate: base2026 }
    );
    expect(r.ok).toBe(true);
    expect(r.scrubbed.Booking.startDate).toBe('2026-09-20');
  });

  it('scrubs a hallucinated startTime not present in the source', () => {
    const r = verifyBookingExtraction(
      { Client: {}, Booking: { startTime: '7:00 PM' } },
      'The event is at 12:30 PM.',
      { baseDate: base2026 }
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Booking.startTime');
    expect(r.scrubbed.Booking.startTime).toBeNull();
  });

  it('keeps a verified 12:30 PM - 1:45 PM range unchanged', () => {
    const r = verifyBookingExtraction(
      { Client: {}, Booking: { startTime: '12:30 PM', endTime: '1:45 PM' } },
      'Event runs from 12:30 PM - 1:45 PM.',
      { baseDate: base2026 }
    );
    expect(r.ok).toBe(true);
    expect(r.scrubbed.Booking.startTime).toBe('12:30 PM');
    expect(r.scrubbed.Booking.endTime).toBe('1:45 PM');
  });

  it('does not guess an end time when AM/PM is absent in the source', () => {
    const r = verifyBookingExtraction(
      { Client: {}, Booking: { endTime: '1:45 PM' } },
      'Event runs 12:30 - 1:45.',
      { baseDate: base2026 }
    );
    expect(r.ok).toBe(false);
    expect(r.scrubbed.Booking.endTime).toBeNull();
  });

  it('leaves absent fields untouched (no false errors)', () => {
    const r = verifyBookingExtraction({ Client: { name: 'Laura' }, Booking: {} }, 'no dates', { baseDate: base2026 });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe('resolveEventDates', () => {
  it('resolves a full date+time range to epochs', () => {
    const r = resolveEventDates('Event on September 20, 2026 from 7pm - 9pm', base2026);
    expect(r.ok).toBe(true);
    expect(r.st).toBe(wallClockEpochUtc(2026, 9, 20, 19, 0));
    expect(r.et).toBe(wallClockEpochUtc(2026, 9, 20, 21, 0));
  });
});
