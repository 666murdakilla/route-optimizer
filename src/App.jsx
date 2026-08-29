import { useEffect, useState } from 'react'
import { useGoogleMaps } from './hooks/useGoogleMaps'
import { loadLocations, saveLocations } from './lib/storage'
import { computeRoutes, recomputeRouteTotals } from './lib/computeRoutes'
import { loadSavedRoutes, saveSavedRoutes } from './lib/savedRoutes'
import MapView from './components/MapView'
import LocationForm from './components/LocationForm'
import LocationList from './components/LocationList'
import RoutePanel from './components/RoutePanel'
import './App.css'

export default function App() {
  const mapsStatus = useGoogleMaps()
  const [locations, setLocations] = useState(() => loadLocations())
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [startId, setStartId] = useState(null)
  const [endId, setEndId] = useState(null)
  const [savedRoutes, setSavedRoutes] = useState(() => loadSavedRoutes())
  // routesResult holds the solver's raw output plus the distance/duration
  // matrices it was solved against; routeViews holds what's actually
  // displayed (order/totals/per-stop schedule), which manual reordering and
  // schedule edits mutate without ever needing to re-fetch the matrices.
  const [routesResult, setRoutesResult] = useState(null)
  const [routeViews, setRouteViews] = useState(null)
  const [routesLoading, setRoutesLoading] = useState(false)
  const [routesError, setRoutesError] = useState(null)
  const [visibleRoutes, setVisibleRoutes] = useState({ distance: true, time: true })

  const selectedLocations = locations.filter((loc) => selectedIds.has(loc.id))

  useEffect(() => {
    saveLocations(locations)
  }, [locations])

  useEffect(() => {
    saveSavedRoutes(savedRoutes)
  }, [savedRoutes])

  // Keep the chosen start point valid as the selection changes, defaulting
  // to the first-selected location (in the order locations were added).
  // Deliberately keyed only on selectedIds - selectedLocations/startId are
  // derived from it and re-checking them here is the point of the effect.
  useEffect(() => {
    if (selectedLocations.length === 0) {
      setStartId(null)
      return
    }
    if (!selectedLocations.some((loc) => loc.id === startId)) {
      setStartId(selectedLocations[0].id)
    }
  }, [selectedIds])

  // Keep the chosen end point valid: clear it if its location was
  // deselected, or if it now collides with the start point.
  useEffect(() => {
    if (endId && (endId === startId || !selectedLocations.some((loc) => loc.id === endId))) {
      setEndId(null)
    }
  }, [selectedIds, startId])

  function handleAdd(location) {
    setLocations((prev) => [...prev, location])
  }

  function handleDelete(id) {
    setLocations((prev) => prev.filter((loc) => loc.id !== id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setRoutesResult(null)
    setRouteViews(null)
    setRoutesError(null)
  }

  function handleToggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setRoutesResult(null)
    setRouteViews(null)
    setRoutesError(null)
  }

  function handleStartChange(newStartId) {
    setStartId(newStartId)
    setEndId((prev) => (prev === newStartId ? null : prev))
  }

  async function handleCalculate() {
    if (selectedLocations.length < 2) return
    const startIndex = Math.max(
      0,
      selectedLocations.findIndex((loc) => loc.id === startId),
    )
    const endLookup = endId ? selectedLocations.findIndex((loc) => loc.id === endId) : -1
    const endIndex = endLookup >= 0 ? endLookup : null

    setRoutesLoading(true)
    setRoutesError(null)
    setRoutesResult(null)
    setRouteViews(null)
    try {
      const result = await computeRoutes(selectedLocations, startIndex, endIndex)
      setRoutesResult(result)
      setRouteViews({
        distance: routeViewFromSummary(result.distance),
        time: routeViewFromSummary(result.time),
      })
    } catch (err) {
      setRoutesError(err.message || 'Could not calculate routes. Please try again.')
    } finally {
      setRoutesLoading(false)
    }
  }

  function handleToggleVisible(key) {
    setVisibleRoutes((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleReorder(routeKey, newOrder) {
    const { totalMiles, totalMinutes } = recomputeRouteTotals(
      newOrder,
      routesResult.locations,
      routesResult.matrices.distanceMiles,
      routesResult.matrices.durationMinutes,
    )
    setRouteViews((prev) => ({
      ...prev,
      [routeKey]: { ...prev[routeKey], order: newOrder, totalMiles, totalMinutes },
    }))
  }

  function handleResetOrder(routeKey) {
    setRouteViews((prev) => ({
      ...prev,
      [routeKey]: {
        ...prev[routeKey],
        order: routesResult[routeKey].order,
        totalMiles: routesResult[routeKey].totalMiles,
        totalMinutes: routesResult[routeKey].totalMinutes,
      },
    }))
  }

  function handleDurationChange(routeKey, locationId, minutes) {
    setRouteViews((prev) => ({
      ...prev,
      [routeKey]: {
        ...prev[routeKey],
        stopDurations: { ...prev[routeKey].stopDurations, [locationId]: minutes },
      },
    }))
  }

  function handleAnchorChange(routeKey, locationId, time) {
    setRouteViews((prev) => {
      const current = prev[routeKey]
      if (time === '') {
        if (current.anchor?.locationId !== locationId) return prev
        return { ...prev, [routeKey]: { ...current, anchor: null } }
      }
      return { ...prev, [routeKey]: { ...current, anchor: { locationId, time } } }
    })
  }

  function handleSaveRoute(routeKey, day) {
    const view = routeViews[routeKey]
    setSavedRoutes((prev) => ({
      ...prev,
      [day]: {
        savedAt: new Date().toISOString(),
        routeKey,
        order: view.order,
        totalMiles: view.totalMiles,
        totalMinutes: view.totalMinutes,
      },
    }))
  }

  function handleDeleteSavedRoute(day) {
    setSavedRoutes((prev) => ({ ...prev, [day]: null }))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Route Optimizer</h1>
        <p>Add locations, pick your stops, and find the fastest and shortest routes between them.</p>
      </header>

      {mapsStatus === 'missing-key' && (
        <div className="banner banner-error">
          Missing Google Maps API key. Copy <code>.env.example</code> to <code>.env</code> and set{' '}
          <code>VITE_GOOGLE_MAPS_API_KEY</code>, then restart the dev server.
        </div>
      )}
      {mapsStatus === 'error' && (
        <div className="banner banner-error">
          Failed to load Google Maps. Check that your API key is valid and that the Maps JavaScript,
          Places, and Geocoding APIs are enabled for it.
        </div>
      )}

      <main className="app-layout">
        <section className="map-panel">
          {mapsStatus === 'ready' ? (
            <MapView locations={locations} routes={routeViews} visibleRoutes={visibleRoutes} />
          ) : (
            <div className="map-placeholder">
              {mapsStatus === 'loading' ? 'Loading map…' : 'Map unavailable.'}
            </div>
          )}
        </section>

        <section className="side-panel">
          {mapsStatus === 'ready' ? (
            <LocationForm onAdd={handleAdd} />
          ) : (
            <div className="location-form location-form-disabled">
              <h2>Add a location</h2>
              <p>{disabledFormMessage(mapsStatus)}</p>
            </div>
          )}

          <div className="location-list-panel">
            <h2>Locations ({locations.length})</h2>
            <LocationList
              locations={locations}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onDelete={handleDelete}
            />
          </div>

          {mapsStatus === 'ready' && (
            <RoutePanel
              selectedLocations={selectedLocations}
              startId={startId}
              onStartChange={handleStartChange}
              endId={endId}
              onEndChange={setEndId}
              onCalculate={handleCalculate}
              loading={routesLoading}
              error={routesError}
              routesResult={routesResult}
              routeViews={routeViews}
              visibleRoutes={visibleRoutes}
              onToggleVisible={handleToggleVisible}
              onReorder={handleReorder}
              onResetOrder={handleResetOrder}
              onDurationChange={handleDurationChange}
              onAnchorChange={handleAnchorChange}
              onSaveRoute={handleSaveRoute}
              savedRoutes={savedRoutes}
              onDeleteSavedRoute={handleDeleteSavedRoute}
            />
          )}
        </section>
      </main>
    </div>
  )
}

function routeViewFromSummary(routeSummary) {
  return {
    order: routeSummary.order,
    totalMiles: routeSummary.totalMiles,
    totalMinutes: routeSummary.totalMinutes,
    stopDurations: {},
    anchor: null,
  }
}

function disabledFormMessage(mapsStatus) {
  if (mapsStatus === 'missing-key') return 'Add a Google Maps API key to enable this form.'
  if (mapsStatus === 'error') return 'This form is unavailable because Google Maps failed to load.'
  return 'Waiting for Google Maps to load…'
}
