import { useEffect, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

let loaderPromise = null

// The Loader is a singleton so React StrictMode's double-invoke (and any
// re-renders across components that need the API) never requests the
// Maps script twice.
function loadGoogleMaps() {
  if (!loaderPromise) {
    const loader = new Loader({
      apiKey: API_KEY || '',
      version: 'weekly',
      libraries: ['places', 'geometry'],
    })
    loaderPromise = loader.load()
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
