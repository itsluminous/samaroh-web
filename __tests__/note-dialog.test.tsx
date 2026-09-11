/**
 * Note popup flows: permission-gated action set (view-only without
 * notes.edit; Delete forever only in Trash with notes.delete), status
 * actions per state, edit-mode save payload (trimmed title, pending
 * checklist item flushed), the pointer-events checklist drag (mouse
 * press-and-move + touch long-press pickup), tag create-on-the-fly, and
 * Share's clipboard fallback when the Web Share API is unavailable.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  // Mirrors the screen's derivation (edit implies the toggle) unless a test
  // pins the checklist-split combo explicitly.
  canToggle = undefined as boolean | undefined,
  startInEdit = false,
  tags = [vendorsTag],
  noteTagIds = [] as string[],
  onSaveContent = jest.fn(async (_input: NoteInput) => {
    void _input;
  }),
  onToggleItem = jest.fn(async (_itemId: string) => {
    void _itemId;
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
        canToggle={canToggle ?? canEdit}
        startInEdit={startInEdit}
        onSaveContent={onSaveContent}
        onSaveTags={jest.fn(async () => {})}
        onCreateTag={onCreateTag}
        onTogglePin={jest.fn(async () => {})}
        onToggleItem={onToggleItem}
        onSetStatus={onSetStatus}
        onPurge={onPurge}
        onShared={onShared}
        onClose={onClose}
        onDiscard={onDiscard}
      />
    </NextIntlClientProvider>,
  );
  return { onSaveContent, onToggleItem, onSetStatus, onPurge, onCreateTag, onShared, onDiscard, onClose };
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

describe('NoteDialog — checklist done-toggle split (shared migration 007)', () => {
  const splitNote = (done = false) =>
    makeNote({
      kind: 'checklist',
      title: 'Puja list',
      content: null,
      checklist: [
        { id: 'i1', text: 'Garlands', done },
        { id: 'i2', text: 'Diyas', done: false },
      ],
    });

  it('a toggle-only member (canToggle without canEdit) can tick items in view mode', async () => {
    const { onToggleItem, onSaveContent } = renderDialog({
      note: splitNote(),
      canEdit: false,
      canDelete: false,
      canToggle: true,
    });
    // View-only action set: no edit/pin/delete affordances…
    expect(action(en.notes.action.edit)).not.toBeInTheDocument();
    // …but the checkboxes stay live and dispatch the toggle-only path.
    const checkbox = screen.getByRole('checkbox', { name: 'Garlands' });
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    await waitFor(() => expect(onToggleItem).toHaveBeenCalledWith('i1'));
    // Never the full-content save — the 007 guard would reject wider patches.
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it('without canToggle the view-mode checkboxes are disabled', () => {
    renderDialog({ note: splitNote(), canEdit: false, canDelete: false, canToggle: false });
    expect(screen.getByRole('checkbox', { name: 'Garlands' })).toBeDisabled();
  });

  it('in Trash the checkboxes are disabled even with canToggle', () => {
    renderDialog({
      note: { ...splitNote(), status: 'trashed', trashed_at: '2026-09-02T10:00:00Z' },
      canToggle: true,
    });
    expect(screen.getByRole('checkbox', { name: 'Garlands' })).toBeDisabled();
  });

  it('view mode strikes checked items (line-through) and leaves unchecked ones alone', () => {
    renderDialog({ note: splitNote(true), canEdit: false, canToggle: true });
    expect(screen.getByText('Garlands')).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.getByText('Diyas')).toHaveStyle({ textDecoration: 'none' });
  });

  it('edit mode strikes checked items too (strike parity with the card preview)', () => {
    renderDialog({ note: splitNote(true), startInEdit: true });
    expect(screen.getByText('Garlands')).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.getByText('Diyas')).toHaveStyle({ textDecoration: 'none' });
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

describe('NoteDialog — pin in create/edit (buffered)', () => {
  it('create flow offers the pin toggle and saves pinned=true without onTogglePin', async () => {
    const onTogglePin = jest.fn(async () => {});
    const onSaveContent = jest.fn(async (_input: NoteInput) => {
      void _input;
    });
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <NoteDialog
          note={makeNote({ title: null, content: null, pinned: false })}
          tags={[]}
          noteTagIds={[]}
          canEdit
          canDelete
          canToggle
          startInEdit
          onSaveContent={onSaveContent}
          onSaveTags={jest.fn(async () => {})}
          onCreateTag={jest.fn(async (name: string) => ({ ...vendorsTag, id: `new-${name}`, name }))}
          onTogglePin={onTogglePin}
          onToggleItem={jest.fn(async () => {})}
          onSetStatus={jest.fn(async () => {})}
          onPurge={jest.fn(async () => {})}
          onShared={jest.fn()}
          onClose={jest.fn()}
        />
      </NextIntlClientProvider>,
    );
    // Buffered toggle: pin → unpin affordance flips locally, nothing persists yet.
    fireEvent.click(screen.getByRole('button', { name: en.notes.action.pin }));
    expect(screen.getByRole('button', { name: en.notes.action.unpin })).toBeInTheDocument();
    expect(onTogglePin).not.toHaveBeenCalled();
    // The pin lands in the save payload (with some content so it isn't a discard).
    fireEvent.change(screen.getByLabelText(en.notes.editor.title_placeholder), { target: { value: 'Pinned at birth' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalled());
    expect(onSaveContent.mock.calls[0]![0]!.pinned).toBe(true);
    expect(onTogglePin).not.toHaveBeenCalled();
  });

  it('cancelling an edit drops the buffered pin change', async () => {
    const { onSaveContent } = renderDialog(); // existing unpinned note, view mode
    fireEvent.click(action(en.notes.action.edit)!);
    fireEvent.click(screen.getByRole('button', { name: en.notes.action.pin }));
    fireEvent.click(screen.getByRole('button', { name: en.common.action.cancel }));
    // Back in view mode the note is still unpinned; a fresh edit + save keeps pinned=false.
    fireEvent.click(action(en.notes.action.edit)!);
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalled());
    expect(onSaveContent.mock.calls[0]![0]!.pinned).toBe(false);
  });
});

describe('NoteDialog — checklist pointer drag reorder', () => {
  // jsdom has no PointerEvent: a MouseEvent subclass carrying pointerId /
  // pointerType lets Testing Library construct real pointer* events.
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  let rectSpy: jest.SpyInstance;

  beforeAll(() => {
    (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
      PointerEventPolyfill;
  });

  beforeEach(() => {
    // Uniform 40px rows so the midpoint-crossing math has real heights.
    rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 40,
      width: 300,
      height: 40,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    rectSpy.mockRestore();
    jest.useRealTimers();
  });

  const checklistNote = () =>
    makeNote({
      kind: 'checklist',
      content: null,
      checklist: [
        { id: 'i1', text: 'Garlands', done: false },
        { id: 'i2', text: 'Diyas', done: false },
        { id: 'i3', text: 'Lights', done: false },
      ],
    });

  const row = (text: string) => screen.getByText(text).closest('[data-checklist-row]') as HTMLElement;

  async function savedOrder(onSaveContent: jest.Mock) {
    fireEvent.click(screen.getByRole('button', { name: en.common.action.save }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalled());
    const input = onSaveContent.mock.calls[0]![0]! as NoteInput;
    return input.checklist.map((i) => i.text);
  }

  it('mouse: press-and-move picks up without delay and drops at the midpoint-crossed slot', async () => {
    const { onSaveContent } = renderDialog({ note: checklistNote(), startInEdit: true });
    const garlands = row('Garlands');

    fireEvent.pointerDown(garlands, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 20, buttons: 1 });
    // First movement past the jitter threshold picks the row up — no long-press.
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 26 });
    expect(row('Garlands')).toHaveAttribute('data-dragging', 'true');
    // dy=+60 crosses Diyas (20) and Lights (60) midpoints.
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 80 });

    expect(await savedOrder(onSaveContent)).toEqual(['Diyas', 'Lights', 'Garlands']);
  });

  it('mouse: a plain click (no movement) does not reorder', async () => {
    const { onSaveContent } = renderDialog({ note: checklistNote(), startInEdit: true });
    fireEvent.pointerDown(row('Diyas'), { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 60 });
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 60 });
    expect(await savedOrder(onSaveContent)).toEqual(['Garlands', 'Diyas', 'Lights']);
  });

  it('touch: holding still through the 400ms long-press picks up, then the drag reorders', async () => {
    jest.useFakeTimers();
    const { onSaveContent } = renderDialog({ note: checklistNote(), startInEdit: true });
    const lights = row('Lights');

    fireEvent.pointerDown(lights, { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 100 });
    // Wander within the slop while waiting — must not cancel.
    fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 53, clientY: 103 });
    expect(row('Lights')).not.toHaveAttribute('data-dragging');
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(row('Lights')).toHaveAttribute('data-dragging', 'true');
    // dy=-80 crosses both midpoints upward → lands first.
    fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 20 });
    fireEvent.pointerUp(window, { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 20 });
    jest.useRealTimers();

    expect(await savedOrder(onSaveContent)).toEqual(['Lights', 'Garlands', 'Diyas']);
  });

  it('touch: moving past the slop before the timer cancels the press (scroll wins, no reorder)', async () => {
    jest.useFakeTimers();
    const { onSaveContent } = renderDialog({ note: checklistNote(), startInEdit: true });

    fireEvent.pointerDown(row('Garlands'), { pointerId: 3, pointerType: 'touch', clientX: 50, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 3, pointerType: 'touch', clientX: 50, clientY: 40 }); // > 8px slop
    act(() => {
      jest.advanceTimersByTime(400); // a late timer must not resurrect the press
    });
    expect(row('Garlands')).not.toHaveAttribute('data-dragging');
    fireEvent.pointerMove(window, { pointerId: 3, pointerType: 'touch', clientX: 50, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 3, pointerType: 'touch', clientX: 50, clientY: 100 });
    jest.useRealTimers();

    expect(await savedOrder(onSaveContent)).toEqual(['Garlands', 'Diyas', 'Lights']);
  });

  it('pointercancel mid-drag aborts without reordering', async () => {
    const { onSaveContent } = renderDialog({ note: checklistNote(), startInEdit: true });
    fireEvent.pointerDown(row('Garlands'), { pointerId: 4, pointerType: 'mouse', clientX: 50, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 4, pointerType: 'mouse', clientX: 50, clientY: 80 });
    expect(row('Garlands')).toHaveAttribute('data-dragging', 'true');
    fireEvent.pointerCancel(window, { pointerId: 4, pointerType: 'mouse' });
    expect(row('Garlands')).not.toHaveAttribute('data-dragging');
    expect(await savedOrder(onSaveContent)).toEqual(['Garlands', 'Diyas', 'Lights']);
  });

  it('a press starting on the checkbox or remove button stays a click (no drag)', () => {
    renderDialog({ note: checklistNote(), startInEdit: true });
    const checkbox = screen.getByRole('checkbox', { name: 'Garlands' });
    fireEvent.pointerDown(checkbox, { pointerId: 5, pointerType: 'mouse', clientX: 10, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 5, pointerType: 'mouse', clientX: 10, clientY: 80 });
    expect(row('Garlands')).not.toHaveAttribute('data-dragging');
    fireEvent.pointerUp(window, { pointerId: 5, pointerType: 'mouse' });
  });

  it('rows carry no HTML5 draggable attribute or drag handle anymore', () => {
    renderDialog({ note: checklistNote(), startInEdit: true });
    expect(document.querySelector('[draggable="true"]')).toBeNull();
    expect(document.querySelector('[data-testid="DragIndicatorIcon"]')).toBeNull();
  });

  it('Enter in the Add-item field appends and keeps focus for the next item', () => {
    renderDialog({ note: checklistNote(), startInEdit: true });
    const addField = screen.getByLabelText(en.notes.editor.checklist_add);
    addField.focus();
    fireEvent.change(addField, { target: { value: 'Rangoli' } });
    fireEvent.keyDown(addField, { key: 'Enter' });
    expect(screen.getByText('Rangoli')).toBeInTheDocument();
    expect(addField).toHaveFocus();
    expect(addField).toHaveValue('');
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

describe('NoteDialog — view-mode tags', () => {
  it('renders tag chips WITHOUT a "Tags" label (chips self-evident; android parity)', () => {
    renderDialog({ noteTagIds: [vendorsTag.id] });
    expect(screen.getByText('Vendors')).toBeInTheDocument();
    // The bare label text must not appear in view mode — only edit mode
    // carries it (as the tag type-ahead field's label).
    expect(screen.queryByText(en.notes.picker.tags_title)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(en.notes.picker.tags_title)).not.toBeInTheDocument();
  });
});
