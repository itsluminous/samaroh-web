import { notFound } from 'next/navigation';
import ReportScreen from '../../_components/ReportScreen';
import { isReportKey, REPORT_KEYS } from '@/lib/reports/types';

// One dynamic route serves all 9 reports (§4.4); unknown keys 404.
export function generateStaticParams() {
  return REPORT_KEYS.map((report) => ({ report }));
}

export default async function ReportPage(props: { params: Promise<{ report: string }> }) {
  const { report } = await props.params;
  if (!isReportKey(report)) {
    notFound();
  }
  return <ReportScreen reportKey={report} />;
}
