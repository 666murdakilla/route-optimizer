import { getDistanceDurationMatrix, hasUnreachablePair } from './distanceMatrix'
import { pathCost, solveTSP } from './tsp'

// Ties the Distance Matrix lookup and the TSP solver together: fetches
// real-world costs for the selected stops, then solves the same stop set
// twice - once optimizing for distance, once for time - so both routes can
// be shown side by side. `endIndex` is optional; when given, both solves are
// constrained to finish at that stop instead of ending wherever is cheapest.
//
// The raw matrices and the `locations` array they're indexed against are
// returned alongside the results so the UI can recompute totals for a
// manually reordered route (see recomputeRouteTotals) without calling the
// Distance Matrix API again.
export async function computeRoutes(selectedLocations, startIndex, endIndex = null) {
  const { distanceMiles, durationMinutes } = await getDistanceDurationMatrix(selectedLocations)

  if (hasUnreachablePair(distanceMiles) || hasUnreachablePair(durationMinutes)) {
    throw new Error(
      'No driving route exists between at least one pair of selected locations, so a route cannot be calculated.',
    )
  }

  const distanceResult = solveTSP(distanceMiles, startIndex, endIndex)
  const timeResult = solveTSP(durationMinutes, startIndex, endIndex)

  const distanceRoute = buildRouteSummary(distanceResult.order, selectedLocations, distanceMiles, durationMinutes)
  const timeRoute = buildRouteSummary(timeResult.order, selectedLocations, distanceMiles, durationMinutes)

  const identicalOrder = distanceResult.order.join(',') === timeResult.order.join(',')

  return {
    distance: distanceRoute,
    time: timeRoute,
    identicalOrder,
    locations: selectedLocations,
    matrices: { distanceMiles, durationMinutes },
  }
}

function buildRouteSummary(orderIndices, locations, distanceMiles, durationMinutes) {
  return {
    order: orderIndices.map((i) => locations[i]),
    totalMiles: pathCost(orderIndices, distanceMiles),
    totalMinutes: pathCost(orderIndices, durationMinutes),
  }
}

// Recomputes total miles/minutes for a manually reordered stop list. `order`
// is a permutation of the same stops `locations`/the matrices were built
// from - reordering never changes which stops are involved, only their
// sequence, so no new API call is needed.
export function recomputeRouteTotals(order, locations, distanceMiles, durationMinutes) {
  const indexById = new Map(locations.map((loc, i) => [loc.id, i]))
  const orderIndices = order.map((loc) => indexById.get(loc.id))
  return {
    totalMiles: pathCost(orderIndices, distanceMiles),
    totalMinutes: pathCost(orderIndices, durationMinutes),
  }
}
