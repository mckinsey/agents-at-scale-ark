'use client';

import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import {
  SectionFormDialog,
  type SectionFormValues,
} from '@/components/dialogs/section-form-dialog';
import { Button } from '@/components/ui/button';
import {
  UNGROUPED_KEY,
  applyLayout,
  createSection,
  deleteSection,
  layoutEqual,
  moveRow,
  moveSection,
  toLayout,
  updateSection,
  type LayoutSection,
  type SectionedLayout,
} from '@/lib/utils/section-layout';
import { generateUUID } from '@/lib/utils/uuid';

const ROW_DND_TYPE = 'sortable-sectioned-list-row';
const SECTION_DND_TYPE = 'sortable-sectioned-list-section';

interface RowDragItem {
  fromKey: string;
  index: number;
}

export interface SortableSectionedListHandle {
  openCreateGroup: () => void;
}

export interface SortableSectionedListProps<T> {
  readonly ref?: Ref<SortableSectionedListHandle>;
  readonly items: readonly T[];
  readonly getKey: (item: T) => string;
  readonly layout: SectionedLayout;
  readonly setLayout: (
    update:
      | SectionedLayout
      | ((current: SectionedLayout) => SectionedLayout),
  ) => void;
  readonly renderItem: (
    item: T,
    params: { dragHandle: ReactNode; itemKey: string },
  ) => ReactNode;
  readonly itemNoun?: { singular: string; plural: string };
}

const DEFAULT_NOUN = { singular: 'item', plural: 'items' } as const;

interface UseSortableItemOptions<DragItem> {
  itemType: string;
  makeItem: () => DragItem;
  onHover: (dragItem: DragItem) => void;
  onDrop: () => void;
  onCancel: () => void;
}

function useSortableItem<DragItem>({
  itemType,
  makeItem,
  onHover,
  onDrop,
  onCancel,
}: UseSortableItemOptions<DragItem>) {
  const outerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  const [, drop] = useDrop<DragItem>({
    accept: itemType,
    hover: onHover,
    drop: () => onDrop(),
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: itemType,
    item: makeItem,
    collect: monitor => ({ isDragging: monitor.isDragging() }),
    end: (_item, monitor) => {
      if (!monitor.didDrop()) onCancel();
    },
  });

  drop(outerRef);
  preview(outerRef);
  drag(handleRef);

  return { outerRef, handleRef, isDragging };
}

interface RowHandlers {
  onHoverMove: (item: RowDragItem, toKey: string, toIndex: number) => void;
  onDropCommit: () => void;
  onDragCancel: () => void;
  onKeyboardMove: (groupKey: string, index: number, delta: number) => void;
  registerHandleRef: (
    itemKey: string,
    element: HTMLButtonElement | null,
  ) => void;
}

interface SortableRowProps<T> extends RowHandlers {
  readonly item: T;
  readonly itemKey: string;
  readonly groupKey: string;
  readonly index: number;
  readonly totalInGroup: number;
  readonly renderItem: SortableSectionedListProps<T>['renderItem'];
}

function SortableRow<T>({
  item,
  itemKey,
  groupKey,
  index,
  totalInGroup,
  onHoverMove,
  onDropCommit,
  onDragCancel,
  onKeyboardMove,
  registerHandleRef,
  renderItem,
}: SortableRowProps<T>) {
  const { outerRef, handleRef, isDragging } = useSortableItem<RowDragItem>({
    itemType: ROW_DND_TYPE,
    makeItem: () => ({ fromKey: groupKey, index }),
    onHover: dragItem => {
      if (dragItem.fromKey === groupKey && dragItem.index === index) return;
      onHoverMove(dragItem, groupKey, index);
      dragItem.fromKey = groupKey;
      dragItem.index = index;
    },
    onDrop: onDropCommit,
    onCancel: onDragCancel,
  });

  const setHandleRef = useCallback(
    (element: HTMLButtonElement | null) => {
      handleRef.current = element;
      registerHandleRef(itemKey, element);
    },
    [handleRef, itemKey, registerHandleRef],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      onKeyboardMove(groupKey, index, -1);
    } else if (event.key === 'ArrowDown' && index < totalInGroup - 1) {
      event.preventDefault();
      onKeyboardMove(groupKey, index, 1);
    }
  };

  const dragHandle = (
    <button
      ref={setHandleRef}
      type="button"
      onClick={e => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      aria-label={`Reorder ${itemKey}. Use Arrow Up and Arrow Down to move.`}
      className="text-muted-foreground focus-visible:ring-ring hover:text-foreground flex h-8 w-8 flex-shrink-0 cursor-grab items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 active:cursor-grabbing">
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div
      ref={outerRef}
      className={isDragging ? 'opacity-40' : 'opacity-100'}
      data-testid={`sortable-row-${itemKey}`}>
      {renderItem(item, { dragHandle, itemKey })}
    </div>
  );
}

interface TrailingDropZoneProps {
  readonly groupKey: string;
  readonly index: number;
  readonly empty: boolean;
  readonly onHoverMove: RowHandlers['onHoverMove'];
  readonly onDropCommit: RowHandlers['onDropCommit'];
  readonly pluralNoun: string;
}

function TrailingDropZone({
  groupKey,
  index,
  empty,
  onHoverMove,
  onDropCommit,
  pluralNoun,
}: TrailingDropZoneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver }, drop] = useDrop({
    accept: ROW_DND_TYPE,
    hover(item: RowDragItem) {
      const sameGroup = item.fromKey === groupKey;
      const toIndex = sameGroup ? Math.max(0, index - 1) : index;
      if (sameGroup && item.index === toIndex) return;
      onHoverMove(item, groupKey, toIndex);
      item.fromKey = groupKey;
      item.index = toIndex;
    },
    drop: () => onDropCommit(),
    collect: monitor => ({ isOver: monitor.isOver() }),
  });
  drop(ref);

  if (empty) {
    return (
      <div
        ref={ref}
        data-testid={`drop-zone-${groupKey}`}
        className={`rounded-md border-2 border-dashed p-6 text-center text-sm transition-colors ${
          isOver
            ? 'border-primary bg-primary/5 text-foreground'
            : 'border-border text-muted-foreground'
        }`}>
        {`Drop ${pluralNoun} here`}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      data-testid={`drop-zone-${groupKey}`}
      className={`h-8 rounded-md transition-colors ${
        isOver ? 'bg-primary/10 border-primary border-2 border-dashed' : ''
      }`}
    />
  );
}

interface SectionCardProps<T> extends RowHandlers {
  readonly section: LayoutSection;
  readonly items: T[];
  readonly getKey: (item: T) => string;
  readonly renderItem: SortableSectionedListProps<T>['renderItem'];
  readonly sectionIndex: number;
  readonly sectionCount: number;
  readonly pluralNoun: string;
  readonly onSectionHoverMove: (from: number, to: number) => void;
  readonly onSectionDropCommit: () => void;
  readonly onSectionDragCancel: () => void;
  readonly onSectionKeyboardMove: (index: number, delta: number) => void;
  readonly registerSectionHandleRef: (
    id: string,
    element: HTMLButtonElement | null,
  ) => void;
  readonly onEditSection: (section: LayoutSection) => void;
  readonly onDeleteSection: (section: LayoutSection) => void;
}

function SectionCard<T>({
  section,
  items,
  getKey,
  renderItem,
  sectionIndex,
  sectionCount,
  pluralNoun,
  onSectionHoverMove,
  onSectionDropCommit,
  onSectionDragCancel,
  onSectionKeyboardMove,
  registerSectionHandleRef,
  onEditSection,
  onDeleteSection,
  ...rowHandlers
}: SectionCardProps<T>) {
  const {
    outerRef: cardRef,
    handleRef: sectionHandleRef,
    isDragging,
  } = useSortableItem<{ index: number }>({
    itemType: SECTION_DND_TYPE,
    makeItem: () => ({ index: sectionIndex }),
    onHover: dragItem => {
      if (dragItem.index === sectionIndex) return;
      onSectionHoverMove(dragItem.index, sectionIndex);
      dragItem.index = sectionIndex;
    },
    onDrop: onSectionDropCommit,
    onCancel: onSectionDragCancel,
  });

  const setSectionHandleRef = useCallback(
    (element: HTMLButtonElement | null) => {
      sectionHandleRef.current = element;
      registerSectionHandleRef(section.id, element);
    },
    [sectionHandleRef, section.id, registerSectionHandleRef],
  );

  const handleHeaderKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === 'ArrowUp' && sectionIndex > 0) {
      event.preventDefault();
      onSectionKeyboardMove(sectionIndex, -1);
    } else if (event.key === 'ArrowDown' && sectionIndex < sectionCount - 1) {
      event.preventDefault();
      onSectionKeyboardMove(sectionIndex, 1);
    }
  };

  return (
    <div
      ref={cardRef}
      className={`bg-card rounded-lg border ${isDragging ? 'opacity-40' : ''}`}
      data-testid={`section-card-${section.id}`}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <button
          ref={setSectionHandleRef}
          type="button"
          onKeyDown={handleHeaderKeyDown}
          aria-label={`Reorder group ${section.name}. Use Arrow Up and Arrow Down to move.`}
          className="text-muted-foreground focus-visible:ring-ring hover:text-foreground flex h-8 w-8 flex-shrink-0 cursor-grab items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{section.name}</h2>
          {section.description && (
            <p className="text-muted-foreground text-sm break-words">
              {section.description}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onEditSection(section)}
          aria-label={`Edit group ${section.name}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:text-red-500"
          onClick={() => onDeleteSection(section)}
          aria-label={`Delete group ${section.name}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {items.map((item, index) => {
          const itemKey = getKey(item);
          return (
            <SortableRow
              key={itemKey}
              item={item}
              itemKey={itemKey}
              groupKey={section.id}
              index={index}
              totalInGroup={items.length}
              renderItem={renderItem}
              {...rowHandlers}
            />
          );
        })}
        <TrailingDropZone
          groupKey={section.id}
          index={items.length}
          empty={items.length === 0}
          onHoverMove={rowHandlers.onHoverMove}
          onDropCommit={rowHandlers.onDropCommit}
          pluralNoun={pluralNoun}
        />
      </div>
    </div>
  );
}

interface UngroupedAreaProps<T> extends RowHandlers {
  readonly items: T[];
  readonly getKey: (item: T) => string;
  readonly renderItem: SortableSectionedListProps<T>['renderItem'];
  readonly labelled: boolean;
  readonly pluralNoun: string;
}

function UngroupedArea<T>({
  items,
  getKey,
  renderItem,
  labelled,
  pluralNoun,
  ...rowHandlers
}: UngroupedAreaProps<T>) {
  return (
    <div className="flex flex-col gap-3">
      {labelled && (
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Ungrouped
        </h2>
      )}
      {items.map((item, index) => {
        const itemKey = getKey(item);
        return (
          <SortableRow
            key={itemKey}
            item={item}
            itemKey={itemKey}
            groupKey={UNGROUPED_KEY}
            index={index}
            totalInGroup={items.length}
            renderItem={renderItem}
            {...rowHandlers}
          />
        );
      })}
      <TrailingDropZone
        groupKey={UNGROUPED_KEY}
        index={items.length}
        empty={labelled && items.length === 0}
        onHoverMove={rowHandlers.onHoverMove}
        onDropCommit={rowHandlers.onDropCommit}
        pluralNoun={pluralNoun}
      />
    </div>
  );
}

export function SortableSectionedList<T>({
  ref,
  items,
  getKey,
  layout,
  setLayout,
  renderItem,
  itemNoun = DEFAULT_NOUN,
}: SortableSectionedListProps<T>) {
  const [draftLayout, setDraftLayout] = useState<SectionedLayout | null>(null);
  const displayLayout = draftLayout ?? layout;

  const rendered = useMemo(
    () => applyLayout(items, displayLayout, getKey),
    [items, displayLayout, getKey],
  );

  const baseLayout = useMemo(
    () => toLayout(applyLayout(items, layout, getKey), getKey),
    [items, layout, getKey],
  );

  const handleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const sectionHandleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pendingFocusRowKeyRef = useRef<string | null>(null);
  const pendingFocusSectionIdRef = useRef<string | null>(null);

  const registerHandleRef = useCallback(
    (itemKey: string, element: HTMLButtonElement | null) => {
      if (element) handleRefs.current.set(itemKey, element);
      else handleRefs.current.delete(itemKey);
    },
    [],
  );

  const registerSectionHandleRef = useCallback(
    (id: string, element: HTMLButtonElement | null) => {
      if (element) sectionHandleRefs.current.set(id, element);
      else sectionHandleRefs.current.delete(id);
    },
    [],
  );

  useEffect(() => {
    const rowKey = pendingFocusRowKeyRef.current;
    if (rowKey) {
      const element = handleRefs.current.get(rowKey);
      if (element) {
        element.focus();
        pendingFocusRowKeyRef.current = null;
      }
    }
    const sectionId = pendingFocusSectionIdRef.current;
    if (sectionId) {
      const element = sectionHandleRefs.current.get(sectionId);
      if (element) {
        element.focus();
        pendingFocusSectionIdRef.current = null;
      }
    }
  }, [rendered]);

  const handleRowHoverMove = useCallback(
    (item: RowDragItem, toKey: string, toIndex: number) => {
      setDraftLayout(current => {
        const source = current ?? baseLayout;
        return moveRow(source, item.fromKey, item.index, toKey, toIndex);
      });
    },
    [baseLayout],
  );

  const handleSectionHoverMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      setDraftLayout(current => {
        const source = current ?? baseLayout;
        return moveSection(source, fromIndex, toIndex);
      });
    },
    [baseLayout],
  );

  const commitDraft = useCallback(() => {
    setDraftLayout(current => {
      if (current && !layoutEqual(current, baseLayout)) {
        setLayout(current);
      }
      return null;
    });
  }, [baseLayout, setLayout]);

  const cancelDraft = useCallback(() => {
    setDraftLayout(null);
  }, []);

  const handleRowKeyboardMove = useCallback(
    (groupKey: string, index: number, delta: number) => {
      const source = draftLayout ?? baseLayout;
      const group =
        groupKey === UNGROUPED_KEY
          ? rendered.ungrouped
          : rendered.sections.find(s => s.section.id === groupKey)?.items;
      const target = index + delta;
      if (!group || target < 0 || target >= group.length) return;
      pendingFocusRowKeyRef.current = getKey(group[index]);
      setLayout(moveRow(source, groupKey, index, groupKey, target));
      setDraftLayout(null);
    },
    [draftLayout, baseLayout, rendered, getKey, setLayout],
  );

  const handleSectionKeyboardMove = useCallback(
    (index: number, delta: number) => {
      const source = draftLayout ?? baseLayout;
      const target = index + delta;
      if (target < 0 || target >= source.sections.length) return;
      pendingFocusSectionIdRef.current = source.sections[index].id;
      setLayout(moveSection(source, index, target));
      setDraftLayout(null);
    },
    [draftLayout, baseLayout, setLayout],
  );

  type SectionDialogState =
    | { mode: 'create' }
    | { mode: 'edit'; section: LayoutSection };
  const [sectionDialog, setSectionDialog] =
    useState<SectionDialogState | null>(null);
  const [deletingSection, setDeletingSection] =
    useState<LayoutSection | null>(null);

  const openCreateSection = useCallback(
    () => setSectionDialog({ mode: 'create' }),
    [],
  );

  useImperativeHandle(ref, () => ({ openCreateGroup: openCreateSection }), [
    openCreateSection,
  ]);
  const openEditSection = useCallback(
    (section: LayoutSection) => setSectionDialog({ mode: 'edit', section }),
    [],
  );
  const openDeleteSection = useCallback(
    (section: LayoutSection) => setDeletingSection(section),
    [],
  );

  const handleSectionDialogSubmit = useCallback(
    (values: SectionFormValues) => {
      if (sectionDialog?.mode === 'edit') {
        setLayout(
          updateSection(layout, sectionDialog.section.id, {
            name: values.name,
            description: values.description ?? '',
          }),
        );
      } else {
        setLayout(
          createSection(layout, {
            id: generateUUID(),
            name: values.name,
            description: values.description,
          }),
        );
      }
    },
    [sectionDialog, layout, setLayout],
  );

  const handleConfirmDeleteSection = useCallback(() => {
    if (!deletingSection) return;
    setLayout(deleteSection(layout, deletingSection.id));
  }, [deletingSection, layout, setLayout]);

  const rowHandlers: RowHandlers = useMemo(
    () => ({
      onHoverMove: handleRowHoverMove,
      onDropCommit: commitDraft,
      onDragCancel: cancelDraft,
      onKeyboardMove: handleRowKeyboardMove,
      registerHandleRef,
    }),
    [
      handleRowHoverMove,
      commitDraft,
      cancelDraft,
      handleRowKeyboardMove,
      registerHandleRef,
    ],
  );

  const hasSections = rendered.sections.length > 0;
  const editingSection =
    sectionDialog?.mode === 'edit' ? sectionDialog.section : null;

  return (
    <>
      <DndProvider backend={HTML5Backend}>
        <div className="flex flex-col gap-6">
          {rendered.sections.map((renderedSection, sectionIndex) => (
            <SectionCard
              key={renderedSection.section.id}
              section={renderedSection.section}
              items={renderedSection.items}
              getKey={getKey}
              renderItem={renderItem}
              sectionIndex={sectionIndex}
              sectionCount={rendered.sections.length}
              pluralNoun={itemNoun.plural}
              onSectionHoverMove={handleSectionHoverMove}
              onSectionDropCommit={commitDraft}
              onSectionDragCancel={cancelDraft}
              onSectionKeyboardMove={handleSectionKeyboardMove}
              registerSectionHandleRef={registerSectionHandleRef}
              onEditSection={openEditSection}
              onDeleteSection={openDeleteSection}
              {...rowHandlers}
            />
          ))}
          <UngroupedArea
            items={rendered.ungrouped}
            getKey={getKey}
            renderItem={renderItem}
            labelled={hasSections}
            pluralNoun={itemNoun.plural}
            {...rowHandlers}
          />
        </div>
      </DndProvider>
      <SectionFormDialog
        open={sectionDialog !== null}
        onOpenChange={open => {
          if (!open) setSectionDialog(null);
        }}
        mode={sectionDialog?.mode ?? 'create'}
        initialValues={
          editingSection
            ? {
                name: editingSection.name,
                description: editingSection.description ?? '',
              }
            : undefined
        }
        onSubmit={handleSectionDialogSubmit}
      />
      <ConfirmationDialog
        open={deletingSection !== null}
        onOpenChange={open => {
          if (!open) setDeletingSection(null);
        }}
        title="Delete Group"
        description={
          deletingSection
            ? `Delete group "${deletingSection.name}"? Its ${deletingSection.itemKeys.length} ${itemNoun.singular}${deletingSection.itemKeys.length === 1 ? '' : 's'} will return to Ungrouped.`
            : ''
        }
        confirmText="Delete"
        onConfirm={handleConfirmDeleteSection}
      />
    </>
  );
}
