import SectionGuard from '@/components/SectionGuard';
import ExpensesHome from './_components/ExpensesHome';

// Expenses home (spec §4.2): gave/got totals, party search + list, add person.
// SectionGuard shows the localized no-access state without expenses.view.
export default function ExpensesPage() {
  return (
    <SectionGuard module="expenses">
      <ExpensesHome />
    </SectionGuard>
  );
}
