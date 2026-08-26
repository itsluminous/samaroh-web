import SettingsScreen from '../_components/SettingsScreen';

// Settings (§4.4, web scope): language, theme, business profile, sync
// status, Google-link stub. Android-only concerns (reminders, backup,
// dynamic color) stay on Android — see docs/decisions.md.
export default function SettingsPage() {
  return <SettingsScreen />;
}
