// Builds a Google Maps "universal URL" that opens driving directions for a
// route's stops in order - no API key needed, since it's just a normal
// maps.google.com link (opens in the Google Maps app on phones, or the web
// on desktop). See https://developers.google.com/maps/documentation/urls/get-started#directions-action
export function buildGoogleMapsDirectionsUrl(order) {
  if (!order || order.length < 2) return null

  const asLatLng = (loc) => `${loc.lat},${loc.lng}`
  const params = new URLSearchParams({
    api: '1',
    origin: asLatLng(order[0]),
    destination: asLatLng(order[order.length - 1]),
    travelmode: 'driving',
  })

  const waypoints = order
    .slice(1, -1)
    .map(asLatLng)
    .join('|')
  if (waypoints) params.set('waypoints', waypoints)

  return `https://www.google.com/maps/dir/?${params.toString()}`
}
