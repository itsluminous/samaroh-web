'use client';

import { useParams } from 'next/navigation';
import ItemDetail from '../_components/ItemDetail';

// Per-item detail (spec §4.3): header + FIFO value + transaction history.
export default function InventoryItemPage() {
  const params = useParams<{ itemId: string }>();
  return <ItemDetail itemId={params.itemId} />;
}
