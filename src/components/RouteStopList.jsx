import { useState } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDurationMinutes } from '../lib/schedule'
import { buildGoogleMapsDirectionsUrl } from '../lib/mapsLink'
import { buildIcsCalendar, downloadTextFile } from '../lib/calendarExport'
import { DAYS_OF_WEEK } from '../lib/savedRoutes'

// One route's (distance- or time-optimized) stop list: drag-and-drop
// reorderable, with a per-stop arrival time and dwell duration (both fully
// manual - typing a time on one stop never changes any other stop's time),
// and a button to snap back to the solver's original order.
export default function RouteStopList({
  routeKey,
  label,
  order,
  totalMiles,
  totalMinutes,
  stopDurations,
  times,
  pinned,
  visible,
  onToggleVisible,
  isModified,
  onReorder,
  onResetOrder,
  onDurationChange,
  onTimeChange,
  onSaveRoute,
  onTogglePin,
  onRecalculate,
  scheduleDate,
  onScheduleDateChange,
  phoneByLocationId,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [saveDay, setSaveDay] = useState('')
  const [savedConfirmation, setSavedConfirmation] = useState('')

  const mapsUrl = buildGoogleMapsDirectionsUrl(order)
  const pinnedCount = Object.keys(pinned).length
  const hasAnyTime = Object.values(times).some(Boolean)
  const canExportCalendar = Boolean(scheduleDate && hasAnyTime)

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

  function handleExportCalendar() {
    const ics = buildIcsCalendar(order, scheduleDate, stopDurations, times, phoneByLocationId)
    if (!ics) return
    downloadTextFile(`${routeKey}-route-${scheduleDate}.ics`, ics, 'text/calendar')
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

      <div className="calendar-export-control">
        <label className="stop-field">
          <span>Date</span>
          <input type="date" value={scheduleDate} onChange={(e) => onScheduleDateChange(e.target.value)} />
        </label>
        <button type="button" onClick={handleExportCalendar} disabled={!canExportCalendar}>
          Export to Calendar
        </button>
        {!hasAnyTime && <span className="pin-hint">Set an arrival time on a stop below first.</span>}
      </div>

      <div className="pin-control">
        <button type="button" onClick={onRecalculate}>
          Recalculate with pins{pinnedCount > 0 ? ` (${pinnedCount})` : ''}
        </button>
        <span className="pin-hint">📌 a stop below to lock it in place, then recalculate the rest around it.</span>
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
                time={times[loc.id] ?? ''}
                pinned={index === 0 ? true : Boolean(pinned[loc.id])}
                pinDisabled={index === 0}
                onDurationChange={(minutes) => onDurationChange(loc.id, minutes)}
                onTimeChange={(time) => onTimeChange(loc.id, time)}
                onTogglePin={() => onTogglePin(loc.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function StopRow({ loc, index, duration, time, pinned, pinDisabled, onDurationChange, onTimeChange, onTogglePin }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loc.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className={`stop-row${pinned ? ' stop-row-pinned' : ''}`}>
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag to reorder ${loc.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <button
        type="button"
        className={`pin-toggle${pinned ? ' pin-toggle-active' : ''}`}
        aria-label={pinned ? `Unpin ${loc.name}` : `Pin ${loc.name} in place`}
        aria-pressed={pinned}
        disabled={pinDisabled}
        title={pinDisabled ? 'The start stop is always fixed in place' : undefined}
        onClick={onTogglePin}
      >
        📌
      </button>
      <span className="stop-name">
        {index + 1}. {loc.name}
      </span>
      <label className="stop-field">
        <span>Arrive</span>
        <input type="time" value={time} onChange={(e) => onTimeChange(e.target.value)} />
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
