import RouteStopList from './RouteStopList'
import SavedRoutesPanel from './SavedRoutesPanel'

const ROUTE_LABELS = {
  distance: 'Shortest distance',
  time: 'Fastest time',
}

export default function RoutePanel({
  selectedLocations,
  startId,
  onStartChange,
  endId,
  onEndChange,
  onCalculate,
  loading,
  error,
  routesResult,
  routeViews,
  visibleRoutes,
  onToggleVisible,
  onReorder,
  onResetOrder,
  onDurationChange,
  onAnchorChange,
  onSaveRoute,
  savedRoutes,
  onDeleteSavedRoute,
}) {
  const canCalculate = selectedLocations.length >= 2 && !loading
  const identicalOrder =
    routeViews && routeViews.distance.order.map((loc) => loc.id).join(',') === routeViews.time.order.map((loc) => loc.id).join(',')

  return (
    <div className="route-panel">
      <h2>Calculate routes</h2>

      {selectedLocations.length >= 2 && (
        <>
          <label className="field">
            <span>Start point</span>
            <select value={startId} onChange={(e) => onStartChange(e.target.value)}>
              {selectedLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>End point (optional)</span>
            <select value={endId ?? ''} onChange={(e) => onEndChange(e.target.value || null)}>
              <option value="">No fixed end</option>
              {selectedLocations
                .filter((loc) => loc.id !== startId)
                .map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}

      <div className="route-controls">
        <button type="button" className="calculate-btn" disabled={!canCalculate} onClick={onCalculate}>
          {loading ? 'Calculating…' : 'Calculate Routes'}
        </button>
        {selectedLocations.length < 2 && (
          <span className="route-hint">Select at least 2 locations to calculate routes.</span>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {routeViews && (
        <div className="route-results">
          {identicalOrder && (
            <p className="identical-routes-banner">
              The shortest-distance route and the fastest-time route visit the stops in the exact same
              order.
            </p>
          )}

          {['distance', 'time'].map((key) => {
            const view = routeViews[key]
            const isModified = view.order.map((loc) => loc.id).join(',') !== routesResult[key].order.map((loc) => loc.id).join(',')
            return (
              <RouteStopList
                key={key}
                routeKey={key}
                label={ROUTE_LABELS[key]}
                order={view.order}
                totalMiles={view.totalMiles}
                totalMinutes={view.totalMinutes}
                stopDurations={view.stopDurations}
                anchor={view.anchor}
                referenceLocations={routesResult.locations}
                durationMinutes={routesResult.matrices.durationMinutes}
                visible={visibleRoutes[key]}
                onToggleVisible={() => onToggleVisible(key)}
                isModified={isModified}
                onReorder={(newOrder) => onReorder(key, newOrder)}
                onResetOrder={() => onResetOrder(key)}
                onDurationChange={(locId, minutes) => onDurationChange(key, locId, minutes)}
                onAnchorChange={(locId, time) => onAnchorChange(key, locId, time)}
                onSaveRoute={(day) => onSaveRoute(key, day)}
              />
            )
          })}
        </div>
      )}

      <SavedRoutesPanel savedRoutes={savedRoutes} onDelete={onDeleteSavedRoute} />
    </div>
  )
}
