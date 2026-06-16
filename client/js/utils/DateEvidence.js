/**
 * DateEvidence - source-evidence verification for LLM-extracted date/time fields.
 *
 * Ported from the LEEDZ agent_shareLeed reference (share_helpers.py). LLM date/time
 * output is untrusted until the same value can be found in the source text; unverifiable
 * values are scrubbed to null rather than guessed or silently rolled (plan KTD11/R17-R21).
 * Pure functions - no DOM, no chrome, no network. Epochs are built procedurally via Date.UTC.
 */

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONTH_PATTERN = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

const str = (v) => (v == null ? '' : String(v));

/** Coerce a base date to its UTC year (matches the Python UTC coercion). */
function coerceBaseYear(baseDate) {
  if (baseDate instanceof Date) return baseDate.getUTCFullYear();
  if (baseDate === null || baseDate === undefined) return new Date().getUTCFullYear();
  const d = new Date(baseDate);
  return Number.isNaN(d.getTime()) ? new Date().getUTCFullYear() : d.getUTCFullYear();
}

/** Strip ordinal suffixes, normalize dashes, collapse whitespace. */
export function cleanDateText(text) {
  let s = str(text);
  s = s.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
  s = s.replace(/[–—]/g, '-');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

function daysInMonthUtc(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validYmd(year, month, day) {
  return (
    year >= 2024 && year <= 2035 &&
    month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonthUtc(year, month)
  );
}

/** Extract a 20xx year from a string, or null. */
export function extractYear(value) {
  const m = str(value).match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

/**
 * Parse an hour/minute/meridiem token into {hour, minute} (24h), or null.
 * @returns {{hour:number, minute:number}|null}
 */
export function parseTimeToken(hour, min = null, meridiem = null, fallback = null) {
  let parsedHour = parseInt(hour, 10);
  if (Number.isNaN(parsedHour)) return null;
  let minute = (min === null || min === undefined || min === '') ? 0 : parseInt(min, 10);
  if (Number.isNaN(minute)) return null;

  const pm = String(meridiem || fallback || '').toLowerCase().replace(/\./g, '');
  if (parsedHour < 1 || parsedHour > 23 || minute < 0 || minute > 59) return null;
  if (pm) {
    if (parsedHour < 1 || parsedHour > 12) return null;
    if (pm === 'am') parsedHour = (parsedHour === 12) ? 0 : parsedHour;
    if (pm === 'pm') parsedHour = (parsedHour === 12) ? 12 : parsedHour + 12;
  }
  return { hour: parsedHour, minute };
}

/**
 * Extract a time range (or single time) with AM/PM evidence from text.
 * @returns {{start:object, end:object|null, evidence:string}|null}
 */
export function extractTimeRange(text) {
  const s = cleanDateText(text);

  const rangeRe = new RegExp(
    '\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?\\s*' +
    '(?:-|to|until|through)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*' +
    '(am|pm|a\\.m\\.|p\\.m\\.)\\b',
    'i'
  );
  const rangeMatch = s.match(rangeRe);
  if (rangeMatch) {
    const endMeridiem = rangeMatch[6].replace(/\./g, '').toLowerCase();
    const startMeridiem = rangeMatch[3] ? rangeMatch[3].replace(/\./g, '').toLowerCase() : endMeridiem;
    const start = parseTimeToken(rangeMatch[1], rangeMatch[2], startMeridiem);
    const end = parseTimeToken(rangeMatch[4], rangeMatch[5], endMeridiem);
    if (start && end) return { start, end, evidence: rangeMatch[0] };
  }

  const singleRe = new RegExp(
    '\\b(?:at|from)?\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)\\b',
    'i'
  );
  const single = s.match(singleRe);
  if (single) {
    const start = parseTimeToken(single[1], single[2], single[3].replace(/\./g, '').toLowerCase());
    if (start) return { start, end: null, evidence: single[0] };
  }

  return null;
}

/**
 * Extract date parts from text, trying ISO, month-day-range, cross-month range,
 * single month-day, and slash formats in order.
 * @returns {{year,startMonth,startDay,endMonth,endDay,evidence}|{error:string}}
 */
export function extractDateParts(text, baseDate = null) {
  const s = cleanDateText(text);
  const baseYear = coerceBaseYear(baseDate);
  const parsedYear = (value) => (value ? parseInt(value, 10) : baseYear);

  // ISO YYYY-M-D
  let m = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const year = parseInt(m[1], 10), month = parseInt(m[2], 10), day = parseInt(m[3], 10);
    if (validYmd(year, month, day)) {
      return { year, startMonth: month, startDay: day, endMonth: month, endDay: day, evidence: m[0] };
    }
  }

  // Month D - D (same month range)
  m = s.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})\\s*-\\s*(\\d{1,2})(?:,?\\s*(20\\d{2}))?\\b`, 'i'));
  if (m) {
    const year = parsedYear(m[4]);
    const month = MONTHS[m[1].toLowerCase()];
    const startDay = parseInt(m[2], 10), endDay = parseInt(m[3], 10);
    if (validYmd(year, month, startDay) && validYmd(year, month, endDay) && endDay >= startDay) {
      return { year, startMonth: month, startDay, endMonth: month, endDay, evidence: m[0] };
    }
  }

  // Month D - Month D (cross-month range)
  m = s.match(new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,?\\s*(20\\d{2}))?\\s*-\\s*` +
    `(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,?\\s*(20\\d{2}))?\\b`, 'i'));
  if (m) {
    const year = parsedYear(m[3] || m[6]);
    const startMonth = MONTHS[m[1].toLowerCase()], startDay = parseInt(m[2], 10);
    const endMonth = MONTHS[m[4].toLowerCase()], endDay = parseInt(m[5], 10);
    if (validYmd(year, startMonth, startDay) && validYmd(year, endMonth, endDay)) {
      return { year, startMonth, startDay, endMonth, endDay, evidence: m[0] };
    }
  }

  // Single Month D
  m = s.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,?\\s*(20\\d{2}))?\\b`, 'i'));
  if (m) {
    const year = parsedYear(m[3]);
    const month = MONTHS[m[1].toLowerCase()], day = parseInt(m[2], 10);
    if (validYmd(year, month, day)) {
      return { year, startMonth: month, startDay: day, endMonth: month, endDay: day, evidence: m[0] };
    }
  }

  // Slash M/D[/YYYY]
  m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (m) {
    const month = parseInt(m[1], 10), day = parseInt(m[2], 10), year = parsedYear(m[3]);
    if (validYmd(year, month, day)) {
      return { year, startMonth: month, startDay: day, endMonth: month, endDay: day, evidence: m[0] };
    }
  }

  return { error: 'no_supported_date_pattern' };
}

/** Build a UTC wall-clock epoch (ms). Mirrors leedz_wallclock_epoch. */
export function wallClockEpochUtc(year, month, day, hour, minute) {
  return Date.UTC(year, month - 1, day, hour, minute);
}

/** Parse a time string ("HH:MM" 24h, or "H:MM AM/PM") into [hour24, minute] or null. */
export function parseTimeString(s) {
  const value = str(s).trim();
  if (!value) return null;

  const m24 = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m24) return [parseInt(m24[1], 10), parseInt(m24[2], 10)];

  const m12 = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)$/i);
  if (!m12) return null;
  const parsed = parseTimeToken(m12[1], m12[2], m12[3].replace(/\./g, '').toLowerCase());
  return parsed ? [parsed.hour, parsed.minute] : null;
}

/**
 * Verify an LLM date string is supported by the source body. A year that differs from
 * the base year must literally appear in the source (no silent year-rolling).
 * @returns {boolean}
 */
export function verifyDateInBody(llmDateString, body, baseDate = null) {
  const date = extractDateParts(llmDateString, baseDate);
  if (date.error) return false;

  const baseYear = coerceBaseYear(baseDate);
  const { year, startMonth: month, startDay: day } = date;
  const bodyText = cleanDateText(body);

  if (year !== baseYear && !(new RegExp(`\\b${year}\\b`).test(bodyText))) return false;

  const monthAliases = Object.keys(MONTHS)
    .filter((name) => MONTHS[name] === month)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  const monthPattern = monthAliases.join('|');
  const daySuffix = '(?:st|nd|rd|th)?';
  const year2 = String(year).slice(2);
  const patterns = [
    `\\b${year}-0?${month}-0?${day}\\b`,
    `\\b0?${month}[/-]0?${day}(?:[/-](?:${year}|${year2}))?\\b`,
    `\\b(?:${monthPattern})\\.?\\s+0?${day}${daySuffix}(?:,?\\s*${year})?\\b`
  ];
  return patterns.some((p) => new RegExp(p, 'i').test(bodyText));
}

/**
 * Verify an LLM time string has equivalent evidence in the source body
 * (12h, compact, 24h, noon, midnight). Times without AM/PM are not guessed upstream.
 * @returns {boolean}
 */
export function verifyTimeInBody(llmTimeString, body) {
  const parsed = parseTimeString(llmTimeString);
  if (parsed === null) return false;

  const [hour24, minute] = parsed;
  const bodyText = str(body);
  const hour12 = (hour24 % 12) || 12;
  const meridiem = hour24 < 12 ? 'am' : 'pm';
  const compact = meridiem === 'am' ? 'a' : 'p';
  const minutePart = minute ? `(?::0?${minute})` : `(?::0?${minute})?`;
  const patterns = [
    `(?<!\\d)${hour12}${minutePart}\\s*${meridiem}(?![a-z])`,
    `(?<!\\d)${hour12}${minutePart}\\s*${compact}\\.?\\s*m\\.?(?![a-z])`,
    `(?<!\\d)${hour24}:${String(minute).padStart(2, '0')}(?!\\d)`
  ];
  if (hour24 === 12 && minute === 0) patterns.push('\\bnoon\\b');
  if (hour24 === 0 && minute === 0) patterns.push('\\bmidnight\\b');
  return patterns.some((p) => new RegExp(p, 'i').test(bodyText));
}

/** Reject past starts and non-positive durations. Returns an error code or null. */
export function validateEventEpochs(st, et, nowMs = null) {
  const now = nowMs != null ? nowMs : Date.now();
  if (st < now) return 'start_in_past';
  if (et <= st) return 'end_not_after_start';
  return null;
}

/**
 * Verify the date/time fields of a nested parser result against the source text.
 * Understands the INVOICER shape {Client, Booking:{startDate,endDate,startTime,endTime}}.
 * Only present values are checked; unverifiable values are scrubbed to null.
 * @returns {{ok:boolean, errors:string[], scrubbed:object, evidence:object}}
 */
export function verifyBookingExtraction(llmResult, sourceText, options = {}) {
  const baseDate = options.baseDate || new Date();
  const scrubbed = {
    Client: { ...((llmResult && llmResult.Client) || {}) },
    Booking: { ...((llmResult && llmResult.Booking) || {}) }
  };
  if (llmResult && llmResult.Config) scrubbed.Config = { ...llmResult.Config };

  const errors = [];
  const evidence = {};
  const b = scrubbed.Booking;

  const present = (v) => v !== null && v !== undefined && String(v).trim() !== '';

  for (const field of ['startDate', 'endDate']) {
    if (present(b[field])) {
      if (verifyDateInBody(b[field], sourceText, baseDate)) evidence[field] = b[field];
      else { b[field] = null; errors.push(`Booking.${field}`); }
    }
  }
  for (const field of ['startTime', 'endTime']) {
    if (present(b[field])) {
      if (verifyTimeInBody(b[field], sourceText)) evidence[field] = b[field];
      else { b[field] = null; errors.push(`Booking.${field}`); }
    }
  }

  const ok = errors.length === 0;
  return { ok, errors, scrubbed, evidence: ok ? evidence : {} };
}

/**
 * End-to-end resolution from free text: extract date + time, build epochs, validate.
 * Mirrors resolve_event_dates. Returns {ok:false, errors} or {ok:true, st, et, ...}.
 */
export function resolveEventDates(body, baseDate = null) {
  const text = cleanDateText(body);
  if (!text) return { ok: false, errors: ['missing_text'] };

  const date = extractDateParts(text, baseDate);
  if (date.error) return { ok: false, errors: [date.error] };

  const times = extractTimeRange(text);
  if (!times || !times.start) return { ok: false, errors: ['missing_start_time'] };
  if (!times.end) return { ok: false, errors: ['missing_end_time'] };

  let st = wallClockEpochUtc(date.year, date.startMonth, date.startDay, times.start.hour, times.start.minute);
  let et = wallClockEpochUtc(date.year, date.endMonth, date.endDay, times.end.hour, times.end.minute);

  // Same-day range where end <= start rolls to the next day.
  if (et <= st && date.startDay === date.endDay && date.startMonth === date.endMonth) {
    const next = new Date(Date.UTC(date.year, date.endMonth - 1, date.endDay + 1));
    et = wallClockEpochUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), times.end.hour, times.end.minute);
  }
  if (et <= st) return { ok: false, errors: ['end_not_after_start'] };

  const baseMs = baseDate instanceof Date ? baseDate.getTime() : Date.now();
  if (st < baseMs) return { ok: false, errors: ['start_in_past'] };

  const startIso = new Date(st).toISOString().replace('.000Z', 'Z');
  const endIso = new Date(et).toISOString().replace('.000Z', 'Z');
  return {
    ok: true,
    st,
    et,
    startIso,
    endIso,
    display: `${startIso} to ${endIso}`,
    year: date.year,
    startMonth: date.startMonth,
    startDay: date.startDay,
    endMonth: date.endMonth,
    endDay: date.endDay,
    evidence: { date: date.evidence, time: times.evidence }
  };
}
