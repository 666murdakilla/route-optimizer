import { useEffect, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const LIBRARIES = ['maps', 'places', 'geometry']

let loaderPromise = null

// Cached as a singleton so React StrictMode's double-invoke (and any
// re-renders across components that need the API) never requests the
// Maps script twice - setOptions() throws if called more than once.
function loadGoogleMaps() {
  if (!loaderPromise) {
    setOptions({ key: API_KEY || '', v: 'weekly' })
    loaderPromise = Promise.all(LIBRARIES.map((library) => importLibrary(library)))
  }
  return loaderPromise
}

export function useGoogleMaps() {
  const [status, setStatus] = useState(API_KEY ? 'loading' : 'missing-key')

  useEffect(() => {
    if (!API_KEY) return

    let cancelled = false
    loadGoogleMaps()
      .then(() => {
        if (!cancelled) setStatus('ready')
      })
      .catch((err) => {
        console.error('Failed to load Google Maps JavaScript API', err)
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return status
}
