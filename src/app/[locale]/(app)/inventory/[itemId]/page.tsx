'use client';

import { useParams } from 'next/navigation';
import SectionGuard from '@/components/SectionGuard';
import ItemDetail from '../_components/ItemDetail';

// Per-item detail (spec §4.3): header + FIFO value + transaction history.
// SectionGuard shows the localized no-access state without inventory.view.
export default function InventoryItemPage() {
  const params = useParams<{ itemId: string }>();
  return (
    <SectionGuard module="inventory">
      <ItemDetail itemId={params.itemId} />
    </SectionGuard>
  );
}
