const METERS_PER_MILE = 1609.344

// Fetches real driving distance (miles) and driving time (minutes, using
// live traffic when Google can estimate it) between every pair of the given
// locations, returning two N x N matrices indexed the same way as the
// `locations` array.
//
// We issue one Distance Matrix request per origin (a single origin against
// all destinations) rather than one big all-vs-all request. The API caps
// elements (origins x destinations) per client-side request at 100; querying
// row-by-row keeps every request small regardless of how many stops are
// selected, instead of silently failing once stops exceed ~10.
export async function getDistanceDurationMatrix(locations) {
  const n = locations.length
  const service = new window.google.maps.DistanceMatrixService()
  const destinations = locations.map((loc) => ({ lat: loc.lat, lng: loc.lng }))

  const distanceMiles = Array.from({ length: n }, () => new Array(n).fill(0))
  const durationMinutes = Array.from({ length: n }, () => new Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    const origin = { lat: locations[i].lat, lng: locations[i].lng }
    const response = await requestRow(service, origin, destinations)
    const elements = response.rows[0].elements

    elements.forEach((element, j) => {
      if (i === j) {
        distanceMiles[i][j] = 0
        durationMinutes[i][j] = 0
        return
      }
      if (element.status !== 'OK') {
        distanceMiles[i][j] = Infinity
        durationMinutes[i][j] = Infinity
        return
      }
      const durationSeconds = (element.duration_in_traffic ?? element.duration).value
      distanceMiles[i][j] = element.distance.value / METERS_PER_MILE
      durationMinutes[i][j] = durationSeconds / 60
    })
  }

  return { distanceMiles, durationMinutes }
}

function requestRow(service, origin, destinations) {
  return new Promise((resolve, reject) => {
    service.getDistanceMatrix(
      {
        origins: [origin],
        destinations,
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
        },
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      },
      (response, status) => {
        if (status === 'OK' && response) {
          resolve(response)
        } else {
          reject(new Error(`Distance Matrix request failed (${status}).`))
        }
      },
    )
  })
}

// True if any pair of locations has no known route between them (e.g. an
// island with no driving connection), which would make TSP costs infinite.
export function hasUnreachablePair(matrix) {
  return matrix.some((row) => row.some((value) => value === Infinity))
}
