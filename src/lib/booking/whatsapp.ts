// WhatsApp share-link builder (§4.1): wa.me deep link with prefilled,
// localized reminder text. India-first phone normalization.

/**
 * Normalizes a phone number to international digits for wa.me.
 * 10-digit local numbers get the Indian country code (91) prefixed.
 * Returns null when there are not enough digits to form a number.
 */
export function normalizePhoneForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  if (digits.length >= 11) {
    return digits.replace(/^0+/, '');
  }
  return null;
}

/** Builds the wa.me URL with prefilled text, or null when the phone is unusable. */
export function buildWhatsAppLink(phone: string | null, text: string): string | null {
  if (!phone) {
    return null;
  }
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) {
    return null;
  }
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}
