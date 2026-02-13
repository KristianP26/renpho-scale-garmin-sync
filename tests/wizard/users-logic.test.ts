import { describe, it, expect } from 'vitest';
import { validateDate, validatePositiveNumber } from '../../src/wizard/steps/users.js';
import { generateSlug, validateSlugUniqueness } from '../../src/config/slugify.js';

// ─── validateDate() ───────────────────────────────────────────────────────

describe('validateDate()', () => {
  it('accepts valid date', () => {
    expect(validateDate('1990-06-15')).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(validateDate('15/06/1990')).toBe('Must be YYYY-MM-DD format');
  });

  it('rejects invalid format (missing dash)', () => {
    expect(validateDate('19900615')).toBe('Must be YYYY-MM-DD format');
  });

  it('rejects invalid date (Feb 30)', () => {
    expect(validateDate('2000-02-30')).toBe('Invalid date');
  });

  it('rejects future date', () => {
    expect(validateDate('2099-01-01')).toBe('Birth date cannot be in the future');
  });

  it('accepts leap year date', () => {
    expect(validateDate('2000-02-29')).toBe(true);
  });

  it('rejects non-leap year Feb 29', () => {
    expect(validateDate('2001-02-29')).toBe('Invalid date');
  });
});

// ─── validatePositiveNumber() ─────────────────────────────────────────────

describe('validatePositiveNumber()', () => {
  it('accepts positive number', () => {
    expect(validatePositiveNumber('183')).toBe(true);
  });

  it('accepts decimal', () => {
    expect(validatePositiveNumber('72.5')).toBe(true);
  });

  it('rejects zero', () => {
    expect(validatePositiveNumber('0')).toBe('Must be a positive number');
  });

  it('rejects negative number', () => {
    expect(validatePositiveNumber('-5')).toBe('Must be a positive number');
  });

  it('rejects non-numeric string', () => {
    expect(validatePositiveNumber('abc')).toBe('Must be a positive number');
  });

  it('rejects empty string', () => {
    expect(validatePositiveNumber('')).toBe('Must be a positive number');
  });
});

// ─── Weight range lbs→kg conversion ──────────────────────────────────────

describe('Weight range lbs→kg conversion', () => {
  it('converts lbs to kg correctly', () => {
    const lbs = 150;
    const kg = Math.round((lbs / 2.20462) * 100) / 100;
    expect(kg).toBeCloseTo(68.04, 1);
  });

  it('converts 100 lbs to kg', () => {
    const kg = Math.round((100 / 2.20462) * 100) / 100;
    expect(kg).toBeCloseTo(45.36, 1);
  });

  it('converts 220 lbs to kg', () => {
    const kg = Math.round((220 / 2.20462) * 100) / 100;
    expect(kg).toBeCloseTo(99.79, 1);
  });
});

// ─── Slug generation + preview ───────────────────────────────────────────

describe('Slug generation for wizard', () => {
  it('generates slug from typical name', () => {
    expect(generateSlug('Alice')).toBe('alice');
  });

  it('generates slug from name with spaces', () => {
    expect(generateSlug('Mama Janka')).toBe('mama-janka');
  });

  it('generates slug from name with diacritics', () => {
    expect(generateSlug('Kristián Partl')).toBe('kristian-partl');
  });

  it('validates uniqueness of generated slugs', () => {
    const slugs = ['alice', 'bob', 'alice'];
    expect(validateSlugUniqueness(slugs)).toEqual(['alice']);
  });

  it('returns empty duplicates for unique slugs', () => {
    expect(validateSlugUniqueness(['alice', 'bob'])).toEqual([]);
  });
});
