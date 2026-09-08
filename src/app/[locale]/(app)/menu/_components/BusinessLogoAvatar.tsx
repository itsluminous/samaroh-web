'use client';

/**
 * Read-only business logo preview (owner feedback: the web business profile
 * had no image). Fetches the PNG from the private `logos` bucket exactly like
 * the invoice header does (`fetchLogoPng`, src/lib/invoice/client.ts) and
 * shows it as a rounded card-sized avatar; falls back to the business-name
 * initials when the business has no logo or storage is unavailable (guest
 * mode's local client has no storage). The web app has NO logo upload path —
 * the logo is set/changed from the mobile app (docs/decisions.md), which is
 * why the profile card pairs this with `settings.business.logo_mobile_hint`.
 */
import Avatar from '@mui/material/Avatar';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { fetchLogoPng } from '@/lib/invoice/client';

/** First letters of the first two words of the business name, uppercased. */
export function businessInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase();
}

interface BusinessLogoAvatarProps {
  supabase: SupabaseClient;
  business: { name: string; logo_path: string | null };
  size?: number;
}

export default function BusinessLogoAvatar({ supabase, business, size = 64 }: BusinessLogoAvatarProps) {
  const [src, setSrc] = useState<string | null>(null);
  const logoPath = business.logo_path;

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const bytes = await fetchLogoPng(supabase, { logo_path: logoPath });
        if (!bytes || cancelled) {
          return;
        }
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
        setSrc(url);
      } catch {
        // Storage unavailable (e.g. flaky network) — keep the placeholder.
      }
    })();
    return () => {
      cancelled = true;
      if (url) {
        URL.revokeObjectURL(url);
      }
      setSrc(null);
    };
  }, [supabase, logoPath]);

  return (
    <Avatar
      src={src ?? undefined}
      alt={business.name}
      variant="rounded"
      sx={{ width: size, height: size, fontSize: size / 2.5, bgcolor: 'primary.main' }}
    >
      {businessInitials(business.name)}
    </Avatar>
  );
}
