import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchesCombo,
  isPartOfCombo,
  isTextInputType,
  formatKeyCombo,
  formatTime,
  formatUrl,
  generateId,
  trimHistory
} from '../utils.js';

describe('matchesCombo', () => {
  it('should match exact key combo with Ctrl+Shift+K', () => {
    const event = {
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      key: 'k',
      code: 'KeyK'
    };
    const combo = {
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      key: 'k',
      code: 'KeyK'
    };
    expect(matchesCombo(event, combo)).toBe(true);
  });

  it('should match by code when key differs', () => {
    const event = {
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      key: 'K', // Different case
      code: 'KeyK'
    };
    const combo = {
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      key: 'k',
      code: 'KeyK'
    };
    expect(matchesCombo(event, combo)).toBe(true);
  });

  it('should not match when modifier differs', () => {
    const event = {
      ctrlKey: true,
      shiftKey: false, // Missing shift
      altKey: false,
      metaKey: false,
      key: 'k',
      code: 'KeyK'
    };
    const combo = {
      ctrlKey: true,
      shiftKey: true, // Requires shift
      altKey: false,
      metaKey: false,
      key: 'k',
      code: 'KeyK'
    };
    expect(matchesCombo(event, combo)).toBe(false);
  });

  it('should not match when key differs', () => {
    const event = {
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      key: 'j',
      code: 'KeyJ'
    };
    const combo = {
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      key: 'k',
      code: 'KeyK'
    };
    expect(matchesCombo(event, combo)).toBe(false);
  });

  it('should match Alt+Space combo', () => {
    const event = {
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
      metaKey: false,
      key: ' ',
      code: 'Space'
    };
    const combo = {
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
      metaKey: false,
      key: ' ',
      code: 'Space'
    };
    expect(matchesCombo(event, combo)).toBe(true);
  });

  it('should match Cmd/Meta+Period combo', () => {
    const event = {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: true,
      key: '.',
      code: 'Period'
    };
    const combo = {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: true,
      key: '.',
      code: 'Period'
    };
    expect(matchesCombo(event, combo)).toBe(true);
  });

  it('should not match when extra modifier is pressed', () => {
    const event = {
      ctrlKey: true,
      shiftKey: true, // Extra modifier
      altKey: false,
      metaKey: false,
      key: 'k',
      code: 'KeyK'
    };
    const combo = {
      ctrlKey: true,
      shiftKey: false, // Not expected
      altKey: false,
      metaKey: false,
      key: 'k',
      code: 'KeyK'
    };
    expect(matchesCombo(event, combo)).toBe(false);
  });
});

describe('isPartOfCombo', () => {
  const combo = {
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    key: 'k',
    code: 'KeyK'
  };

  it('should return true when main key is released', () => {
    const event = { key: 'k', code: 'KeyK' };
    expect(isPartOfCombo(event, combo)).toBe(true);
  });

  it('should return true when Control is released (if combo uses it)', () => {
    const event = { key: 'Control', code: 'ControlLeft' };
    expect(isPartOfCombo(event, combo)).toBe(true);
  });

  it('should return true when Shift is released (if combo uses it)', () => {
    const event = { key: 'Shift', code: 'ShiftLeft' };
    expect(isPartOfCombo(event, combo)).toBe(true);
  });

  it('should return false when Alt is released (if combo does not use it)', () => {
    const event = { key: 'Alt', code: 'AltLeft' };
    expect(isPartOfCombo(event, combo)).toBe(false);
  });

  it('should return false when Meta is released (if combo does not use it)', () => {
    const event = { key: 'Meta', code: 'MetaLeft' };
    expect(isPartOfCombo(event, combo)).toBe(false);
  });

  it('should return false for unrelated key', () => {
    const event = { key: 'j', code: 'KeyJ' };
    expect(isPartOfCombo(event, combo)).toBe(false);
  });

  it('should match by code when checking main key', () => {
    const event = { key: 'K', code: 'KeyK' }; // Different case
    expect(isPartOfCombo(event, combo)).toBe(true);
  });

  it('should handle combo with all modifiers', () => {
    const fullCombo = {
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      metaKey: true,
      key: 'a',
      code: 'KeyA'
    };

    expect(isPartOfCombo({ key: 'Control' }, fullCombo)).toBe(true);
    expect(isPartOfCombo({ key: 'Shift' }, fullCombo)).toBe(true);
    expect(isPartOfCombo({ key: 'Alt' }, fullCombo)).toBe(true);
    expect(isPartOfCombo({ key: 'Meta' }, fullCombo)).toBe(true);
    expect(isPartOfCombo({ key: 'a', code: 'KeyA' }, fullCombo)).toBe(true);
  });
});

describe('isTextInputType', () => {
  it('should return true for "text" type', () => {
    expect(isTextInputType('text')).toBe(true);
  });

  it('should return true for "search" type', () => {
    expect(isTextInputType('search')).toBe(true);
  });

  it('should return true for "url" type', () => {
    expect(isTextInputType('url')).toBe(true);
  });

  it('should return true for "tel" type', () => {
    expect(isTextInputType('tel')).toBe(true);
  });

  it('should return true for "password" type', () => {
    expect(isTextInputType('password')).toBe(true);
  });

  it('should return true for "email" type', () => {
    expect(isTextInputType('email')).toBe(true);
  });

  it('should return true for empty string (default input type)', () => {
    expect(isTextInputType('')).toBe(true);
  });

  it('should return true for undefined (treated as empty)', () => {
    expect(isTextInputType(undefined)).toBe(true);
  });

  it('should return true for null (treated as empty)', () => {
    expect(isTextInputType(null)).toBe(true);
  });

  it('should return false for "number" type', () => {
    expect(isTextInputType('number')).toBe(false);
  });

  it('should return false for "checkbox" type', () => {
    expect(isTextInputType('checkbox')).toBe(false);
  });

  it('should return false for "radio" type', () => {
    expect(isTextInputType('radio')).toBe(false);
  });

  it('should return false for "file" type', () => {
    expect(isTextInputType('file')).toBe(false);
  });

  it('should return false for "date" type', () => {
    expect(isTextInputType('date')).toBe(false);
  });

  it('should return false for "color" type', () => {
    expect(isTextInputType('color')).toBe(false);
  });

  it('should handle case-insensitively', () => {
    expect(isTextInputType('TEXT')).toBe(true);
    expect(isTextInputType('Text')).toBe(true);
    expect(isTextInputType('EMAIL')).toBe(true);
  });
});

describe('formatKeyCombo', () => {
  describe('on Windows/Linux', () => {
    it('should format Ctrl+K', () => {
      const combo = {
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: 'k'
      };
      expect(formatKeyCombo(combo, false)).toBe('Ctrl+K');
    });

    it('should format Ctrl+Shift+K', () => {
      const combo = {
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        key: 'k'
      };
      expect(formatKeyCombo(combo, false)).toBe('Ctrl+Shift+K');
    });

    it('should format Alt+Space', () => {
      const combo = {
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        metaKey: false,
        key: ' '
      };
      expect(formatKeyCombo(combo, false)).toBe('Alt+Space');
    });

    it('should format Win+Period', () => {
      const combo = {
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        key: '.'
      };
      expect(formatKeyCombo(combo, false)).toBe('Win+.');
    });

    it('should format all modifiers', () => {
      const combo = {
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
        metaKey: true,
        key: 'a'
      };
      expect(formatKeyCombo(combo, false)).toBe('Ctrl+Alt+Shift+Win+A');
    });
  });

  describe('on Mac', () => {
    it('should format Ctrl+K', () => {
      const combo = {
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: 'k'
      };
      expect(formatKeyCombo(combo, true)).toBe('Ctrl+K');
    });

    it('should format Option instead of Alt', () => {
      const combo = {
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        metaKey: false,
        key: 'k'
      };
      expect(formatKeyCombo(combo, true)).toBe('Option+K');
    });

    it('should format Cmd instead of Win', () => {
      const combo = {
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        key: '.'
      };
      expect(formatKeyCombo(combo, true)).toBe('Cmd+.');
    });

    it('should format Cmd+Option+Shift+K', () => {
      const combo = {
        ctrlKey: false,
        shiftKey: true,
        altKey: true,
        metaKey: true,
        key: 'k'
      };
      expect(formatKeyCombo(combo, true)).toBe('Option+Shift+Cmd+K');
    });
  });

  describe('key display formatting', () => {
    it('should display Space for space key', () => {
      const combo = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: ' ' };
      expect(formatKeyCombo(combo, false)).toBe('Ctrl+Space');
    });

    it('should uppercase single letter keys', () => {
      const combo = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'a' };
      expect(formatKeyCombo(combo, false)).toBe('Ctrl+A');
    });

    it('should preserve special keys like Escape', () => {
      const combo = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, key: 'Escape' };
      expect(formatKeyCombo(combo, false)).toBe('Escape');
    });

    it('should preserve F-keys', () => {
      const combo = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'F1' };
      expect(formatKeyCombo(combo, false)).toBe('Ctrl+F1');
    });
  });
});

describe('formatTime', () => {
  it('should format today\'s timestamp with "Today at"', () => {
    const now = new Date('2024-01-15T14:30:00');
    const timestamp = new Date('2024-01-15T10:45:00').getTime();

    const result = formatTime(timestamp, now);
    expect(result).toMatch(/^Today at/);
  });

  it('should format past date with date string', () => {
    const now = new Date('2024-01-15T14:30:00');
    const timestamp = new Date('2024-01-10T10:45:00').getTime();

    const result = formatTime(timestamp, now);
    // Date format varies by locale (e.g., "Jan 10" or "10 Jan")
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/10/);
    expect(result).toContain('at');
  });

  it('should include time component', () => {
    const now = new Date('2024-01-15T14:30:00');
    const timestamp = new Date('2024-01-15T10:45:00').getTime();

    const result = formatTime(timestamp, now);
    // Time format varies by locale, but should contain the time
    expect(result).toContain('at');
  });

  it('should handle timestamps from different months', () => {
    const now = new Date('2024-02-15T14:30:00');
    const timestamp = new Date('2024-01-10T10:45:00').getTime();

    const result = formatTime(timestamp, now);
    expect(result).toMatch(/Jan/);
  });

  it('should handle timestamps from different years', () => {
    const now = new Date('2024-02-15T14:30:00');
    const timestamp = new Date('2023-12-25T10:45:00').getTime();

    const result = formatTime(timestamp, now);
    // Date format varies by locale (e.g., "Dec 25" or "25 Dec")
    expect(result).toMatch(/Dec/);
    expect(result).toMatch(/25/);
    expect(result).toContain('at');
  });
});

describe('formatUrl', () => {
  it('should return hostname for root URL', () => {
    expect(formatUrl('https://example.com/')).toBe('example.com');
  });

  it('should return hostname + path for URL with path', () => {
    expect(formatUrl('https://example.com/page')).toBe('example.com/page');
  });

  it('should return hostname + full path for nested URL', () => {
    expect(formatUrl('https://example.com/path/to/page')).toBe('example.com/path/to/page');
  });

  it('should strip query parameters', () => {
    expect(formatUrl('https://example.com/page?foo=bar')).toBe('example.com/page');
  });

  it('should strip hash fragments', () => {
    expect(formatUrl('https://example.com/page#section')).toBe('example.com/page');
  });

  it('should handle subdomains', () => {
    expect(formatUrl('https://www.example.com/page')).toBe('www.example.com/page');
  });

  it('should handle different protocols', () => {
    expect(formatUrl('http://example.com/page')).toBe('example.com/page');
  });

  it('should handle ports', () => {
    expect(formatUrl('https://localhost:3000/api/test')).toBe('localhost:3000/api/test');
  });

  it('should return original string for invalid URL', () => {
    expect(formatUrl('not-a-url')).toBe('not-a-url');
  });

  it('should handle empty string', () => {
    expect(formatUrl('')).toBe('');
  });
});

describe('generateId', () => {
  it('should generate a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('should generate IDs with reasonable length', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(10);
    expect(id.length).toBeLessThan(30);
  });

  it('should start with timestamp-like number', () => {
    const id = generateId();
    const timestampPart = parseInt(id, 10);
    expect(timestampPart).toBeGreaterThan(1000000000000); // After year 2001
  });
});

describe('trimHistory', () => {
  it('should return full array when under limit', () => {
    const history = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(trimHistory(history)).toEqual(history);
  });

  it('should trim to default 500 items', () => {
    const history = Array.from({ length: 600 }, (_, i) => ({ id: String(i) }));
    const trimmed = trimHistory(history);
    expect(trimmed.length).toBe(500);
    // Should keep the last 500 items
    expect(trimmed[0].id).toBe('100');
    expect(trimmed[499].id).toBe('599');
  });

  it('should trim to custom limit', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
    const trimmed = trimHistory(history, 10);
    expect(trimmed.length).toBe(10);
    expect(trimmed[0].id).toBe('10');
    expect(trimmed[9].id).toBe('19');
  });

  it('should handle empty array', () => {
    expect(trimHistory([])).toEqual([]);
  });

  it('should handle array exactly at limit', () => {
    const history = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
    const trimmed = trimHistory(history);
    expect(trimmed.length).toBe(500);
    expect(trimmed[0].id).toBe('0');
  });

  it('should not mutate original array', () => {
    const history = Array.from({ length: 600 }, (_, i) => ({ id: String(i) }));
    const original = [...history];
    trimHistory(history);
    expect(history).toEqual(original);
  });
});
