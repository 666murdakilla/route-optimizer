import { useEffect, useRef } from 'react'

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 } // continental US center
const DEFAULT_ZOOM = 4

const ROUTE_COLORS = {
  distance: '#f97316', // orange = shortest distance
  time: '#2563eb', // blue = fastest time
}

// Renders the Google Map, one marker per saved location (with an info
// window showing the company name), and optionally the two optimized
// route polylines. Kept as a single component so it owns the map/marker
// instances directly instead of fighting React's diffing over them.
export default function MapView({ locations, routes, visibleRoutes }) {
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const infoWindowRef = useRef(null)
  const polylinesRef = useRef({ distance: null, time: null })

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    })
    infoWindowRef.current = new window.google.maps.InfoWindow()
  }, [])

  // Keep markers in sync with the location list.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers = markersRef.current
    const currentIds = new Set(locations.map((loc) => loc.id))

    for (const [id, marker] of markers) {
      if (!currentIds.has(id)) {
        marker.setMap(null)
        markers.delete(id)
      }
    }

    locations.forEach((loc) => {
      let marker = markers.get(loc.id)
      if (!marker) {
        marker = new window.google.maps.Marker({
          position: { lat: loc.lat, lng: loc.lng },
          map,
          title: loc.name,
        })
        marker.addListener('click', () => {
          infoWindowRef.current.setContent(
            `<strong>${escapeHtml(loc.name)}</strong><br />${escapeHtml(loc.address)}`,
          )
          infoWindowRef.current.open({ map, anchor: marker })
        })
        markers.set(loc.id, marker)
      } else {
        marker.setPosition({ lat: loc.lat, lng: loc.lng })
        marker.setTitle(loc.name)
      }
    })

    if (locations.length > 0) {
      const bounds = new window.google.maps.LatLngBounds()
      locations.forEach((loc) => bounds.extend({ lat: loc.lat, lng: loc.lng }))
      map.fitBounds(bounds, 60)
      if (locations.length === 1) {
        map.setZoom(Math.min(map.getZoom(), 14))
      }
    }
  }, [locations])

  // Draw/update the two route polylines.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    ;['distance', 'time'].forEach((key) => {
      const path = routes?.[key]?.order?.map((loc) => ({ lat: loc.lat, lng: loc.lng }))
      const shouldShow = Boolean(path && path.length > 1 && visibleRoutes?.[key])

      if (!polylinesRef.current[key]) {
        polylinesRef.current[key] = new window.google.maps.Polyline({
          strokeColor: ROUTE_COLORS[key],
          strokeWeight: 5,
          strokeOpacity: 0.85,
        })
      }
      const polyline = polylinesRef.current[key]

      if (shouldShow) {
        polyline.setPath(path)
        polyline.setMap(map)
      } else {
        polyline.setMap(null)
      }
    })
  }, [routes, visibleRoutes])

  return <div ref={mapDivRef} className="map-canvas" />
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str ?? ''
  return div.innerHTML
}
