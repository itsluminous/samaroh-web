import SectionGuard from '@/components/SectionGuard';
import Masterlist from '../_components/Masterlist';

// Master-item management (spec §4.3): CRUD with duplicate detection.
// SectionGuard shows the localized no-access state without inventory.view.
export default function MasterlistPage() {
  return (
    <SectionGuard module="inventory">
      <Masterlist />
    </SectionGuard>
  );
}
