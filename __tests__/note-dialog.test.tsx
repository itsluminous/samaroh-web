/**
 * Note popup flows: permission-gated action set (view-only without
 * notes.edit; Delete forever only in Trash with notes.delete), status
 * actions per state, edit-mode save payload (trimmed title, pending
 * checklist item flushed), tag create-on-the-fly, and Share's clipboard
 * fallback when the Web Share API is unavailable.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import NoteDialog from '@/app/[locale]/(app)/notes/_components/NoteDialog';
import type { NoteInput } from '@/app/[locale]/(app)/notes/_lib/queries';
import type { NoteRecord, NoteTagRecord } from '@/app/[locale]/(app)/notes/_lib/types';

function makeNote(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: 'n1',
    business_id: 'b1',
    kind: 'note',
    title: 'Plan',
    content: 'Call the caterer',
    checklist: [],
    color: null,
    pinned: false,
    status: 'active',
    completed_at: null,
    trashed_at: null,
    created_by: 'u1',
    updated_by: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

const vendorsTag: NoteTagRecord = {
  id: 't1',
  business_id: 'b1',
  name: 'Vendors',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  deleted_at: null,
};

function renderDialog({
  note = makeNote(),
  canEdit = true,
  canDelete = true,
  startInEdit = false,
  tags = [vendorsTag],
  noteTagIds = [] as string[],
  onSaveContent = jest.fn(async (_input: NoteInput) => {
    void _input;
  }),
  onSetStatus = jest.fn(async () => {}),
  onPurge = jest.fn(async () => {}),
  onCreateTag = jest.fn(async (name: string) => ({ ...vendorsTag, id: `new-${name}`, name })),
  onShared = jest.fn(),
  onDiscard = jest.fn(async () => {}),
  onClose = jest.fn(),
} = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <NoteDialog
        note={note}
        tags={tags}
        noteTagIds={noteTagIds}
        canEdit={canEdit}
        canDelete={canDelete}
        startInEdit={startInEdit}
        onSaveContent={onSaveContent}
        onSaveTags={jest.fn(async () => {})}
        onCreateTag={onCreateTag}
        onTogglePin={jest.fn(async () => {})}
        onSetStatus={onSetStatus}
        onPurge={onPurge}
        onShared={onShared}
        onClose={onClose}
        onDiscard={onDiscard}
      />
    </NextIntlClientProvider>,
  );
  return { onSaveContent, onSetStatus, onPurge, onCreateTag, onShared, onDiscard, onClose };
}

const action = (name: string) => screen.queryByRole('button', { name });

describe('NoteDialog — permission-gated actions', () => {
  it('active note with notes.edit: pin, edit, complete and delete→trash are offered', () => {
    renderDialog();
    expect(action(en.notes.action.pin)).toBeInTheDocument();
    expect(action(en.notes.action.edit)).toBeInTheDocument();
    expect(action(en.notes.action.complete)).toBeInTheDocument();
    expect(action(en.notes.action.delete)).toBeInTheDocument();
    expect(action(en.notes.action.share)).toBeInTheDocument();
    expect(action(en.notes.action.delete_forever)).not.toBeInTheDocument();
  });

  it('without notes.edit the popup is view-only (Share stays)', () => {
    renderDialog({ canEdit: false, canDelete: false });
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(action(en.notes.action.share)).toBeInTheDocument();
    for (const name of [
      en.notes.action.pin,
      en.notes.action.edit,
      en.notes.action.complete,
      en.notes.action.delete,
      en.notes.action.delete_forever,
    ]) {
      expect(action(name)).not.toBeInTheDocument();
    }
  });

  it('completed note offers un-complete', async () => {
    const { onSetStatus } = renderDialog({ note: makeNote({ status: 'completed', completed_at: '2026-09-02T10:00:00Z' }) });
    fireEvent.click(action(en.notes.action.uncomplete)!);
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith('active'));
  });

  it('trashed note: restore + purge notice; Delete forever only with notes.delete', () => {
    renderDialog({ note: makeNote({ status: 'trashed', trashed_at: '2026-09-02T10:00:00Z' }), canDelete: false });
    expect(screen.getByText(en.notes.trash.notice)).toBeInTheDocument();
    expect(action(en.notes.action.restore)).toBeInTheDocument();
    expect(action(en.notes.action.edit)).not.toBeInTheDocument();
    expect(action(en.notes.action.delete_forever)).not.toBeInTheDocument();
  });

  it('Delete forever purges when notes.delete is granted', async () => {
    const { onPurge } = renderDialog({ note: makeNote({ status: 'trashed', trashed_at: '2026-09-02T10:00:00Z' }) });
    fireEvent.click(action(en.notes.action.delete_forever)!);
    await waitFor(() => expect(onPurge).toHaveBeenCalled());
  });

  it('delete→trash and complete dispatch their status transitions', async () => {
    const { onSetStatus } = renderDialog();
    fireEvent.click(action(en.notes.action.delete)!);
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith('trashed'));
    fireEvent.click(action(en.notes.action.complete)!);
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith('completed'));
  });
});

describe('NoteDialog — edit mode', () => {
  it('saves the trimmed title and body through onSaveContent', async () => {
    const { onSaveContent } = renderDialog();
    fireEvent.click(action(en.notes.action.edit)!);
    fireEvent.change(screen.getByLabelText(en.notes.editor.title_placeholder), { target: { value: '  New title  ' } });
    fireEvent.change(screen.getByLabelText(en.notes.editor.content_placeholder), { target: { value: 'Updated body' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalled());
    const input = onSaveContent.mock.calls[0]![0]!;
    expect(input.title).toBe('New title');
    expect(input.content).toBe('Updated body');
    expect(input.kind).toBe('note');
  });

  it('checklist editor adds, toggles and removes items; a pending item is flushed on save', async () => {
    const note = makeNote({
      kind: 'checklist',
      content: null,
      checklist: [
        { id: 'i1', text: 'Garlands', done: false },
        { id: 'i2', text: 'Diyas', done: false },
      ],
    });
    const { onSaveContent } = renderDialog({ note, startInEdit: true });

    // Toggle the first item and remove the second.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garlands' }));
    fireEvent.click(screen.getAllByRole('button', { name: en.notes.editor.checklist_remove })[1]!);
    // Add one via Enter and leave a second one pending in the field.
    const addField = screen.getByLabelText(en.notes.editor.checklist_add);
    fireEvent.change(addField, { target: { value: 'Lights' } });
    fireEvent.keyDown(addField, { key: 'Enter' });
    fireEvent.change(addField, { target: { value: 'Pending item' } });

    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalled());
    const input = onSaveContent.mock.calls[0]![0]!;
    expect(input.checklist.map((i) => [i.text, i.done])).toEqual([
      ['Garlands', true],
      ['Lights', false],
      ['Pending item', false],
    ]);
  });

  it('creates a tag on the fly from the type-ahead', async () => {
    const { onCreateTag } = renderDialog({ startInEdit: true });
    const tagsInput = screen.getByLabelText(en.notes.picker.tags_title);
    fireEvent.change(tagsInput, { target: { value: 'Decor' } });
    fireEvent.keyDown(tagsInput, { key: 'Enter' });
    await waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Decor'));
  });

  it('reuses an existing tag case-insensitively instead of creating a duplicate', async () => {
    const { onCreateTag } = renderDialog({ startInEdit: true });
    const tagsInput = screen.getByLabelText(en.notes.picker.tags_title);
    fireEvent.change(tagsInput, { target: { value: 'vendors' } });
    fireEvent.keyDown(tagsInput, { key: 'Enter' });
    await waitFor(() => expect(screen.getAllByText('Vendors').length).toBeGreaterThanOrEqual(1));
    expect(onCreateTag).not.toHaveBeenCalled();
  });
});

describe('NoteDialog — tag type-ahead', () => {
  const otherTag: NoteTagRecord = { ...vendorsTag, id: 't2', name: 'Decor' };

  it('shows NO suggestion list before typing (the all-tags list is gone)', () => {
    renderDialog({ startInEdit: true, tags: [vendorsTag, otherTag] });
    const tagsInput = screen.getByLabelText(en.notes.picker.tags_title);
    fireEvent.focus(tagsInput);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('suggests matching tags while typing (debounced)', async () => {
    renderDialog({ startInEdit: true, tags: [vendorsTag, otherTag] });
    const tagsInput = screen.getByLabelText(en.notes.picker.tags_title);
    fireEvent.focus(tagsInput);
    fireEvent.change(tagsInput, { target: { value: 'ven' } });
    // The listbox appears only after the debounce elapses.
    const option = await screen.findByRole('option', { name: 'Vendors' });
    expect(option).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Decor' })).not.toBeInTheDocument();
  });

  it('offers a create-on-the-fly option for an unknown name and creates on click', async () => {
    const { onCreateTag } = renderDialog({ startInEdit: true, tags: [vendorsTag] });
    const tagsInput = screen.getByLabelText(en.notes.picker.tags_title);
    fireEvent.focus(tagsInput);
    fireEvent.change(tagsInput, { target: { value: 'Lighting' } });
    const createOption = await screen.findByRole('option', {
      name: en.notes.picker.tags_create.replace('{name}', 'Lighting'),
    });
    fireEvent.click(createOption);
    await waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Lighting'));
    // The created tag lands as a selected chip.
    expect(await screen.findByText('Lighting')).toBeInTheDocument();
  });

  it('does NOT offer the create option when the typed name matches an existing tag exactly', async () => {
    renderDialog({ startInEdit: true, tags: [vendorsTag] });
    const tagsInput = screen.getByLabelText(en.notes.picker.tags_title);
    fireEvent.focus(tagsInput);
    fireEvent.change(tagsInput, { target: { value: 'vendors' } });
    await screen.findByRole('option', { name: 'Vendors' });
    expect(
      screen.queryByRole('option', {
        name: en.notes.picker.tags_create.replace('{name}', 'vendors'),
      }),
    ).not.toBeInTheDocument();
  });

  it('selected tags render as removable chips', async () => {
    renderDialog({ startInEdit: true, tags: [vendorsTag], noteTagIds: [vendorsTag.id] });
    const chip = screen.getByText('Vendors');
    expect(chip).toBeInTheDocument();
    const remove = screen.getByTestId('CancelIcon');
    expect(remove).toHaveAttribute(
      'aria-label',
      en.notes.picker.tags_remove.replace('{name}', 'Vendors'),
    );
    fireEvent.click(remove);
    await waitFor(() => expect(screen.queryByText('Vendors')).not.toBeInTheDocument());
  });
});

describe('NoteDialog — compact color picker', () => {
  it('the editor renders the compact single-row dot variant', () => {
    renderDialog({ startInEdit: true });
    const group = screen.getByRole('group', { name: en.notes.picker.color_title });
    expect(group).toHaveStyle({ flexWrap: 'nowrap', overflowX: 'auto' });
    expect(screen.getByRole('button', { name: en.booking.color.default })).toHaveStyle({
      width: '22px',
      height: '22px',
    });
  });
});

describe('NoteDialog — empty-create discard', () => {
  it('Cancel on a brand-new note discards it instead of leaving an empty row', async () => {
    const emptyNote = makeNote({ title: null, content: null });
    const { onDiscard, onSaveContent } = renderDialog({ note: emptyNote, startInEdit: true });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.cancel }));
    await waitFor(() => expect(onDiscard).toHaveBeenCalled());
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it('Save on a brand-new note without any content discards it', async () => {
    const emptyNote = makeNote({ title: null, content: null });
    const { onDiscard, onSaveContent } = renderDialog({ note: emptyNote, startInEdit: true });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onDiscard).toHaveBeenCalled());
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it('a checklist of only blank items still counts as empty on save', async () => {
    const emptyChecklist = makeNote({
      kind: 'checklist',
      title: null,
      content: null,
      checklist: [{ id: 'i1', text: '   ', done: false }],
    });
    const { onDiscard, onSaveContent } = renderDialog({ note: emptyChecklist, startInEdit: true });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onDiscard).toHaveBeenCalled());
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it('Save with content saves normally (no discard)', async () => {
    const emptyNote = makeNote({ title: null, content: null });
    const { onDiscard, onSaveContent } = renderDialog({ note: emptyNote, startInEdit: true });
    fireEvent.change(screen.getByLabelText(en.notes.editor.title_placeholder), { target: { value: 'Kept' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalled());
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('Cancel while editing an EXISTING note only leaves edit mode', () => {
    const { onDiscard, onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: en.notes.action.edit }));
    fireEvent.click(screen.getByRole('button', { name: en.common.action.cancel }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Back in view mode: the Edit action is offered again.
    expect(screen.getByRole('button', { name: en.notes.action.edit })).toBeInTheDocument();
  });
});

describe('NoteDialog — share', () => {
  it('falls back to the clipboard when the Web Share API is unavailable', async () => {
    const writeText = jest.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { onShared } = renderDialog();
    fireEvent.click(action(en.notes.action.share)!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Plan\nCall the caterer'));
    expect(onShared).toHaveBeenCalledWith(true);
  });

  it('prefers navigator.share when present', async () => {
    const share = jest.fn(async () => {});
    Object.assign(navigator, { share });
    const { onShared } = renderDialog();
    fireEvent.click(action(en.notes.action.share)!);
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: 'Plan\nCall the caterer' }));
    expect(onShared).toHaveBeenCalledWith(false);
    // Cleanup: jsdom has no navigator.share by default.
    delete (navigator as { share?: unknown }).share;
  });
});
