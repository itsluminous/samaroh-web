import BookingScreen from './components/BookingScreen';

// Booking tab (§4.1): month calendar home. All interactivity lives in the
// client component; this stays a server component for the App Router.
export default function BookingPage() {
  return <BookingScreen />;
}
