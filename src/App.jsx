import { useEffect, useState } from 'react'
import { useGoogleMaps } from './hooks/useGoogleMaps'
import { loadLocations, saveLocations } from './lib/storage'
import { computeRoutes } from './lib/computeRoutes'
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
  const [routes, setRoutes] = useState(null)
  const [routesLoading, setRoutesLoading] = useState(false)
  const [routesError, setRoutesError] = useState(null)
  const [visibleRoutes, setVisibleRoutes] = useState({ distance: true, time: true })

  const selectedLocations = locations.filter((loc) => selectedIds.has(loc.id))

  useEffect(() => {
    saveLocations(locations)
  }, [locations])

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
    setRoutes(null)
    setRoutesError(null)
  }

  function handleToggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setRoutes(null)
    setRoutesError(null)
  }

  async function handleCalculate() {
    if (selectedLocations.length < 2) return
    const startIndex = Math.max(
      0,
      selectedLocations.findIndex((loc) => loc.id === startId),
    )

    setRoutesLoading(true)
    setRoutesError(null)
    setRoutes(null)
    try {
      const result = await computeRoutes(selectedLocations, startIndex)
      setRoutes(result)
    } catch (err) {
      setRoutesError(err.message || 'Could not calculate routes. Please try again.')
    } finally {
      setRoutesLoading(false)
    }
  }

  function handleToggleVisible(key) {
    setVisibleRoutes((prev) => ({ ...prev, [key]: !prev[key] }))
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
            <MapView locations={locations} routes={routes} visibleRoutes={visibleRoutes} />
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
              onStartChange={setStartId}
              onCalculate={handleCalculate}
              loading={routesLoading}
              error={routesError}
              routes={routes}
              visibleRoutes={visibleRoutes}
              onToggleVisible={handleToggleVisible}
            />
          )}
        </section>
      </main>
    </div>
  )
}

function disabledFormMessage(mapsStatus) {
  if (mapsStatus === 'missing-key') return 'Add a Google Maps API key to enable this form.'
  if (mapsStatus === 'error') return 'This form is unavailable because Google Maps failed to load.'
  return 'Waiting for Google Maps to load…'
}
