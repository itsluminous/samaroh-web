// WhatsApp deep link with prefilled localized reminder text (§4.1).

import { buildWhatsAppLink, normalizePhoneForWhatsApp } from '@/lib/booking/whatsapp';

describe('normalizePhoneForWhatsApp', () => {
  it('prefixes the Indian country code for 10-digit numbers', () => {
    expect(normalizePhoneForWhatsApp('98765 43210')).toBe('919876543210');
    expect(normalizePhoneForWhatsApp('+91 98765-43210')).toBe('919876543210');
  });

  it('rejects numbers that are too short', () => {
    expect(normalizePhoneForWhatsApp('12345')).toBeNull();
  });
});

describe('buildWhatsAppLink', () => {
  it('builds a wa.me URL with the encoded text', () => {
    const link = buildWhatsAppLink('9876543210', 'Namaste Ramesh, \u20B9500 is pending');
    expect(link).toBe('https://wa.me/919876543210?text=Namaste%20Ramesh%2C%20%E2%82%B9500%20is%20pending');
  });

  it('returns null when there is no usable phone', () => {
    expect(buildWhatsAppLink(null, 'hello')).toBeNull();
    expect(buildWhatsAppLink('123', 'hello')).toBeNull();
  });
});
