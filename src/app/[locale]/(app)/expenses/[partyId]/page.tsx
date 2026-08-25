'use client';

import { useParams } from 'next/navigation';
import PartyLedger from '../_components/PartyLedger';

// Person ledger (spec §4.2): running balance newest-first + gave/got buttons.
export default function PartyLedgerPage() {
  const params = useParams<{ partyId: string }>();
  return <PartyLedger partyId={params.partyId} />;
}
