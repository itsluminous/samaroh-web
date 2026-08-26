import LanguageScreen from '../../_components/LanguageScreen';

// Full-screen language picker (§4.4): each language rendered in its own
// script, applied immediately, persisted via the NEXT_LOCALE cookie.
export default function LanguagePage() {
  return <LanguageScreen />;
}
