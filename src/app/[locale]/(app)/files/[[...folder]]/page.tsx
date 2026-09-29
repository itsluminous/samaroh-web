'use client';

import { useParams } from 'next/navigation';
import SectionGuard from '@/components/SectionGuard';
import FilesScreen from '../_components/FilesScreen';

// Files tab (shared design D15): `/files` = top level, `/files/{folderId}` =
// inside a folder. The OPTIONAL catch-all keeps one mounted screen across
// folder navigation (only the param changes), so the index loads once.
// SectionGuard shows the localized no-access state without files.view.
export default function FilesPage() {
  const params = useParams<{ folder?: string[] }>();
  const folderId = params.folder?.[0] ?? null;
  return (
    <SectionGuard module="files">
      <FilesScreen folderId={folderId} />
    </SectionGuard>
  );
}
