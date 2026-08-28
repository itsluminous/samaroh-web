import SectionGuard from '@/components/SectionGuard';
import BookingScreen from './components/BookingScreen';

// Booking tab (§4.1): month calendar home. All interactivity lives in the
// client component; this stays a server component for the App Router.
// SectionGuard shows the localized no-access state without booking.view.
export default function BookingPage() {
  return (
    <SectionGuard module="booking">
      <BookingScreen />
    </SectionGuard>
  );
}
