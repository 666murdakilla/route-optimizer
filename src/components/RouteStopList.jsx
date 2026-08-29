import { useState } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { computeArrivalMinutes, dayOffsetLabel, formatDurationMinutes, minutesToInputValue } from '../lib/schedule'
import { buildGoogleMapsDirectionsUrl } from '../lib/mapsLink'
import { DAYS_OF_WEEK } from '../lib/savedRoutes'

// One route's (distance- or time-optimized) stop list: drag-and-drop
// reorderable, with a per-stop arrival time (the "anchor" - see
// lib/schedule.js) and dwell duration, and a button to snap back to the
// solver's original order.
export default function RouteStopList({
  routeKey,
  label,
  order,
  totalMiles,
  totalMinutes,
  stopDurations,
  anchor,
  referenceLocations,
  durationMinutes,
  visible,
  onToggleVisible,
  isModified,
  onReorder,
  onResetOrder,
  onDurationChange,
  onAnchorChange,
  onSaveRoute,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [saveDay, setSaveDay] = useState('')
  const [savedConfirmation, setSavedConfirmation] = useState('')

  const arrivalMinutes = computeArrivalMinutes(order, referenceLocations, durationMinutes, stopDurations, anchor)
  const mapsUrl = buildGoogleMapsDirectionsUrl(order)

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.findIndex((loc) => loc.id === active.id)
    const newIndex = order.findIndex((loc) => loc.id === over.id)
    onReorder(arrayMove(order, oldIndex, newIndex))
  }

  function handleSave() {
    if (!saveDay) return
    onSaveRoute(saveDay)
    setSavedConfirmation(`Saved to ${saveDay}`)
    setSaveDay('')
    setTimeout(() => setSavedConfirmation(''), 2500)
  }

  return (
    <div className="route-summary">
      <div className="route-summary-header">
        <label className="route-toggle">
          <input type="checkbox" checked={visible} onChange={onToggleVisible} />
          <span className={`swatch swatch-${routeKey}`} />
          {label}
        </label>
        <button type="button" className="reset-order-btn" onClick={onResetOrder} disabled={!isModified}>
          Reset to optimized order
        </button>
      </div>
      <p className="route-stats">
        {totalMiles.toFixed(1)} miles · {formatDurationMinutes(totalMinutes)}
        {mapsUrl && (
          <>
            {' · '}
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              Open in Google Maps ↗
            </a>
          </>
        )}
      </p>

      <div className="save-route-control">
        <select value={saveDay} onChange={(e) => setSaveDay(e.target.value)} aria-label="Save this route to a day">
          <option value="">Save to day…</option>
          {DAYS_OF_WEEK.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleSave} disabled={!saveDay}>
          Save
        </button>
        {savedConfirmation && <span className="save-confirmation">{savedConfirmation}</span>}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order.map((loc) => loc.id)} strategy={verticalListSortingStrategy}>
          <ol className="stop-list">
            {order.map((loc, index) => (
              <StopRow
                key={loc.id}
                loc={loc}
                index={index}
                duration={stopDurations[loc.id] ?? 0}
                arrivalMinutes={arrivalMinutes[index]}
                onDurationChange={(minutes) => onDurationChange(loc.id, minutes)}
                onTimeChange={(time) => onAnchorChange(loc.id, time)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function StopRow({ loc, index, duration, arrivalMinutes, onDurationChange, onTimeChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loc.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const timeValue = arrivalMinutes !== null ? minutesToInputValue(arrivalMinutes) : ''
  const offsetLabel = arrivalMinutes !== null ? dayOffsetLabel(arrivalMinutes) : ''

  return (
    <li ref={setNodeRef} style={style} className="stop-row">
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag to reorder ${loc.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="stop-name">
        {index + 1}. {loc.name}
      </span>
      <label className="stop-field">
        <span>Arrive</span>
        <input type="time" value={timeValue} onChange={(e) => onTimeChange(e.target.value)} />
        {offsetLabel && <span className="day-offset">{offsetLabel}</span>}
      </label>
      <label className="stop-field">
        <span>Stay (min)</span>
        <input
          type="number"
          min="0"
          step="5"
          value={duration}
          onChange={(e) => onDurationChange(Math.max(0, Number(e.target.value) || 0))}
        />
      </label>
    </li>
  )
}
