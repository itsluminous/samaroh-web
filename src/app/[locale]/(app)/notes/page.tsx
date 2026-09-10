import SectionGuard from '@/components/SectionGuard';
import NotesScreen from './_components/NotesScreen';

// Notes tab (Keep-style parity): pinned-first card grid, drawer filters and
// the note popup. All interactivity lives in the client component; this
// stays a server component for the App Router. SectionGuard shows the
// localized no-access state without notes.view.
export default function NotesPage() {
  return (
    <SectionGuard module="notes">
      <NotesScreen />
    </SectionGuard>
  );
}
