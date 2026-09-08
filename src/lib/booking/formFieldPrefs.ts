/**
 * Booking-form field visibility preferences (ADR-020 #5 parity, web mirror):
 * device-local booleans deciding which OPTIONAL fields the booking form
 * shows. Android stores them in the settings DataStore; the web mirror is
 * localStorage (same contract as the samaroh_booking_view toggle) with the
 * SAME defaults — security deposit hidden, source and times shown.
 *
 * Hidden fields keep their loaded values: editing a booking with a deposit
 * while the deposit field is hidden saves the stored amount unchanged.
 */

export interface BookingFormFieldPrefs {
  showSecurityDeposit: boolean;
  showSource: boolean;
  showTimes: boolean;
}

/** Android ADR-020 #5 defaults (deposit opt-in, source/times opt-out). */
export const DEFAULT_FORM_FIELD_PREFS: BookingFormFieldPrefs = {
  showSecurityDeposit: false,
  showSource: true,
  showTimes: true,
};

/** localStorage keys — named after the Android DataStore keys for greppability. */
const STORAGE_KEYS: Record<keyof BookingFormFieldPrefs, string> = {
  showSecurityDeposit: 'samaroh_booking_form_show_security_deposit',
  showSource: 'samaroh_booking_form_show_source',
  showTimes: 'samaroh_booking_form_show_times',
};

export function readFormFieldPrefs(): BookingFormFieldPrefs {
  const prefs = { ...DEFAULT_FORM_FIELD_PREFS };
  try {
    for (const key of Object.keys(STORAGE_KEYS) as (keyof BookingFormFieldPrefs)[]) {
      const raw = window.localStorage.getItem(STORAGE_KEYS[key]);
      if (raw === 'true' || raw === 'false') {
        prefs[key] = raw === 'true';
      }
    }
  } catch {
    // Storage unavailable (privacy mode) → defaults.
  }
  return prefs;
}

export function writeFormFieldPref(key: keyof BookingFormFieldPrefs, value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS[key], String(value));
  } catch {
    // Best-effort persistence, mirroring the view-toggle behavior.
  }
}
