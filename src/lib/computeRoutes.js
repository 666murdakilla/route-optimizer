import { getDistanceDurationMatrix, hasUnreachablePair } from './distanceMatrix'
import { pathCost, solveTSP } from './tsp'

// Ties the Distance Matrix lookup and the TSP solver together: fetches
// real-world costs for the selected stops, then solves the same stop set
// twice - once optimizing for distance, once for time - so both routes can
// be shown side by side.
export async function computeRoutes(selectedLocations, startIndex) {
  const { distanceMiles, durationMinutes } = await getDistanceDurationMatrix(selectedLocations)

  if (hasUnreachablePair(distanceMiles) || hasUnreachablePair(durationMinutes)) {
    throw new Error(
      'No driving route exists between at least one pair of selected locations, so a route cannot be calculated.',
    )
  }

  const distanceResult = solveTSP(distanceMiles, startIndex)
  const timeResult = solveTSP(durationMinutes, startIndex)

  const distanceRoute = buildRouteSummary(distanceResult.order, selectedLocations, distanceMiles, durationMinutes)
  const timeRoute = buildRouteSummary(timeResult.order, selectedLocations, distanceMiles, durationMinutes)

  const identicalOrder = distanceResult.order.join(',') === timeResult.order.join(',')

  return { distance: distanceRoute, time: timeRoute, identicalOrder }
}

function buildRouteSummary(orderIndices, locations, distanceMiles, durationMinutes) {
  return {
    order: orderIndices.map((i) => locations[i]),
    totalMiles: pathCost(orderIndices, distanceMiles),
    totalMinutes: pathCost(orderIndices, durationMinutes),
  }
}
