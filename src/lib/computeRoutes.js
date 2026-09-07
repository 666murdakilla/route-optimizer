import { getDistanceDurationMatrix, hasUnreachablePair } from './distanceMatrix'
import { pathCost, solveTSP, solveTSPWithPins } from './tsp'

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

// Re-optimizes a (possibly manually reordered) stop list while keeping some
// stops locked at their current position: position 0 (the current first
// stop) is always locked, since the solver needs a fixed start, plus
// whichever other stops are in `pinnedIds`. Everyone else gets rearranged
// into the remaining positions to minimize `optimizeFor` ('distance' or
// 'time'), using the same already-fetched matrices - no new API call.
export function recalculateWithPins(order, pinnedIds, locations, distanceMiles, durationMinutes, optimizeFor) {
  const indexById = new Map(locations.map((loc, i) => [loc.id, i]))
  const pins = {}
  order.forEach((loc, position) => {
    if (position === 0 || pinnedIds[loc.id]) {
      pins[position] = indexById.get(loc.id)
    }
  })

  const matrix = optimizeFor === 'time' ? durationMinutes : distanceMiles
  const result = solveTSPWithPins(matrix, pins)

  return {
    order: result.order.map((i) => locations[i]),
    totalMiles: pathCost(result.order, distanceMiles),
    totalMinutes: pathCost(result.order, durationMinutes),
  }
}
