'use client';

import { useParams } from 'next/navigation';
import SectionGuard from '@/components/SectionGuard';
import PartyLedger from '../_components/PartyLedger';

// Person ledger (spec §4.2): running balance newest-first + gave/got buttons.
// SectionGuard shows the localized no-access state without expenses.view.
export default function PartyLedgerPage() {
  const params = useParams<{ partyId: string }>();
  return (
    <SectionGuard module="expenses">
      <PartyLedger partyId={params.partyId} />
    </SectionGuard>
  );
}
