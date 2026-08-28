import SectionGuard from '@/components/SectionGuard';
import CurrentStockList from './_components/CurrentStockList';

// Inventory current stock (spec §4.3): FIFO stock/value list + record transaction.
// SectionGuard shows the localized no-access state without inventory.view.
export default function InventoryPage() {
  return (
    <SectionGuard module="inventory">
      <CurrentStockList />
    </SectionGuard>
  );
}
