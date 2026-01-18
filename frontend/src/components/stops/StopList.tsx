/**
 * Stop List Component with Drag & Drop
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Stop } from '../../types';
import StopCard from './StopCard';

interface StopListProps {
  stops: Stop[];
  onRemove: (stopId: string) => void;
  onReorder: (newOrder: string[]) => void;
  editable?: boolean;
}

interface SortableStopProps {
  stop: Stop;
  onRemove: (stopId: string) => void;
  editable: boolean;
}

function SortableStop({ stop, onRemove, editable }: SortableStopProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <StopCard
        stop={stop}
        onRemove={editable ? () => onRemove(stop.id) : undefined}
        dragHandleProps={editable ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}

export default function StopList({
  stops,
  onRemove,
  onReorder,
  editable = true,
}: StopListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = stops.findIndex((s) => s.id === active.id);
      const newIndex = stops.findIndex((s) => s.id === over.id);
      const newOrder = arrayMove(
        stops.map((s) => s.id),
        oldIndex,
        newIndex
      );
      onReorder(newOrder);
    }
  };

  if (stops.length === 0) {
    return (
      <div className="stop-list-empty">
        <p>No stops added yet</p>
        <p className="hint">Add stops from the suggestions below</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={stops.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="stop-list">
          {stops.map((stop, index) => (
            <li key={stop.id} className="stop-list-item">
              <span className="stop-index">{index + 1}</span>
              <SortableStop
                stop={stop}
                onRemove={onRemove}
                editable={editable}
              />
            </li>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
