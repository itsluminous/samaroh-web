import SyncStatusScreen from '../../_components/SyncStatusScreen';

// Sync status (§4.4/§8): pending-outbox count, per-item errors and
// conflicts, last sync time, "Sync now".
export default function SyncStatusPage() {
  return <SyncStatusScreen />;
}
