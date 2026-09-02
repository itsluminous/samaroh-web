// Built-in event types from the shared contract (shared/event-types.json).
// `key` is stored in bookings.event_type, `emoji` seeds bookings.event_icon,
// `label_key` resolves the localized name from the booking.event_type.* keys,
// `color` is the type's default calendar color (a shared/booking-colors.json key).

import eventTypesJson from '../../../shared/event-types.json';

export interface EventTypeDef {
  key: string;
  emoji: string;
  label_key: string;
  color: string;
  /** 'booking' = real customer booking; 'marker' = calendar-only day indicator. */
  kind: EventTypeKind;
}

/** event_types.kind contract (shared/event-types.json $comment): absent → 'booking'. */
export type EventTypeKind = 'booking' | 'marker';

export const EVENT_TYPES: EventTypeDef[] = eventTypesJson.event_types as EventTypeDef[];

export const CUSTOM_EVENT_TYPE_KEY = 'custom';

export function findEventType(key: string): EventTypeDef | undefined {
  return EVENT_TYPES.find((t) => t.key === key);
}

/** True when the stored event_type is one of the built-in keys. */
export function isBuiltInEventType(key: string): boolean {
  return EVENT_TYPES.some((t) => t.key === key);
}
