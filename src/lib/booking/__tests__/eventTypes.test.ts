// Built-in event types contract (shared/event-types.json): every type carries
// a key, emoji, booking.event_type.* label key, and a default calendar color
// that exists in shared/booking-colors.json.

import { BOOKING_COLORS } from '../bookingColors';
import { CUSTOM_EVENT_TYPE_KEY, EVENT_TYPES, findEventType, isBuiltInEventType } from '../eventTypes';

describe('event types (shared contract)', () => {
  it('parses 7 built-in types including custom', () => {
    expect(EVENT_TYPES).toHaveLength(7);
    expect(EVENT_TYPES.some((t) => t.key === CUSTOM_EVENT_TYPE_KEY)).toBe(true);
  });

  it('every entry has an emoji and a booking.event_type.* label key', () => {
    for (const t of EVENT_TYPES) {
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(t.label_key).toBe(`booking.event_type.${t.key}`);
    }
  });

  it('every entry has a default color that exists in booking-colors.json', () => {
    const paletteKeys = new Set(BOOKING_COLORS.map((c) => c.key));
    for (const t of EVENT_TYPES) {
      expect(paletteKeys.has(t.color)).toBe(true);
    }
  });

  it('default colors are distinct across types', () => {
    const colors = EVENT_TYPES.map((t) => t.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('findEventType / isBuiltInEventType resolve built-in keys, not free text', () => {
    expect(findEventType('wedding')?.color).toBe('tomato');
    expect(findEventType('Mehndi Night')).toBeUndefined();
    expect(isBuiltInEventType('birthday')).toBe(true);
    expect(isBuiltInEventType('Mehndi Night')).toBe(false);
  });
});
