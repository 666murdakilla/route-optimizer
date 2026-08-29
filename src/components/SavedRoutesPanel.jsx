import { DAYS_OF_WEEK } from '../lib/savedRoutes'
import { buildGoogleMapsDirectionsUrl } from '../lib/mapsLink'
import { formatDurationMinutes } from '../lib/schedule'

const ROUTE_LABELS = {
  distance: 'Shortest distance',
  time: 'Fastest time',
}

export default function SavedRoutesPanel({ savedRoutes, onDelete }) {
  const savedDays = DAYS_OF_WEEK.filter((day) => savedRoutes[day])

  return (
    <div className="saved-routes-panel">
      <h2>Saved routes</h2>
      {savedDays.length === 0 ? (
        <p className="empty-state">
          No routes saved yet. Calculate a route above, then use "Save to day…" to keep it here.
        </p>
      ) : (
        <ul className="saved-routes-list">
          {savedDays.map((day) => {
            const route = savedRoutes[day]
            const mapsUrl = buildGoogleMapsDirectionsUrl(route.order)
            return (
              <li key={day} className="saved-route-row">
                <div className="saved-route-header">
                  <span className={`swatch swatch-${route.routeKey}`} />
                  <strong>{day}</strong>
                  <span className="saved-route-label">{ROUTE_LABELS[route.routeKey] ?? ''}</span>
                  <button
                    type="button"
                    className="delete-btn"
                    onClick={() => onDelete(day)}
                    aria-label={`Delete ${day}'s saved route`}
                  >
                    ✕
                  </button>
                </div>
                <p className="route-stats">
                  {route.order.length} stops · {route.totalMiles.toFixed(1)} miles ·{' '}
                  {formatDurationMinutes(route.totalMinutes)}
                </p>
                <ol className="saved-stop-list">
                  {route.order.map((loc) => (
                    <li key={loc.id}>{loc.name}</li>
                  ))}
                </ol>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    Open in Google Maps ↗
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
