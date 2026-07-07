const ROUTE_LABELS = {
  distance: 'Shortest distance',
  time: 'Fastest time',
}

export default function RoutePanel({
  selectedLocations,
  startId,
  onStartChange,
  onCalculate,
  loading,
  error,
  routes,
  visibleRoutes,
  onToggleVisible,
}) {
  const canCalculate = selectedLocations.length >= 2 && !loading

  return (
    <div className="route-panel">
      <h2>Calculate routes</h2>

      {selectedLocations.length >= 2 && (
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

      {routes && (
        <div className="route-results">
          {routes.identicalOrder && (
            <p className="identical-routes-banner">
              The shortest-distance route and the fastest-time route visit the stops in the exact same
              order.
            </p>
          )}

          {(['distance', 'time']).map((key) => (
            <div key={key} className="route-summary">
              <h3>
                <label className="route-toggle">
                  <input
                    type="checkbox"
                    checked={visibleRoutes[key]}
                    onChange={() => onToggleVisible(key)}
                  />
                  <span className={`swatch swatch-${key}`} />
                  {ROUTE_LABELS[key]}
                </label>
              </h3>
              <p className="route-stats">
                {routes[key].totalMiles.toFixed(1)} miles · {formatMinutes(routes[key].totalMinutes)}
              </p>
              <ol>
                {routes[key].order.map((loc) => (
                  <li key={loc.id}>{loc.name}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatMinutes(totalMinutes) {
  const rounded = Math.round(totalMinutes)
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`
}
