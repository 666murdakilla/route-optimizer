// Solves the "open path" traveling salesman problem: given a cost matrix
// between N stops, find the visiting order that minimizes total cost,
// optionally with some positions pinned to specific stops (position 0 - the
// start - is always pinned; additional positions, including the last one
// for a fixed end, or any position in between for a manually pinned stop,
// are optional).
//
// Method selection:
//   - N <= HELD_KARP_LIMIT: exact Held-Karp dynamic programming,
//     O(2^N * N^2) time / O(2^N * N) space. For N=12 that's ~4096 * 144
//     table entries - trivial for a browser, and it guarantees the true
//     optimum (nearest-neighbor heuristics can be badly wrong on
//     adversarial layouts).
//   - N > HELD_KARP_LIMIT: Held-Karp's state space explodes exponentially
//     (2^N), so we fall back to a nearest-neighbor construction followed by
//     2-opt local search restricted to the unpinned stretches of the path.
//     This is O(N^2) to build plus O(N^2) per 2-opt pass, which stays fast
//     for dozens of stops and typically lands within a few percent of
//     optimal.
//
// The cost matrix is asymmetric-safe (costMatrix[i][j] need not equal
// costMatrix[j][i]), since real driving distance/time often isn't
// symmetric (one-way streets, highway ramps, traffic direction).

const HELD_KARP_LIMIT = 12

// pins: a plain object mapping 0-indexed position -> stop index in
// costMatrix. Position 0 must always be present (it's the fixed start).
// Any other position is optional - pinning position N-1 fixes the end,
// pinning something in between locks a stop in place while the solver
// re-optimizes everyone else around it.
export function solveTSPWithPins(costMatrix, pins) {
  const n = costMatrix.length
  if (n === 0) return { order: [], total: 0 }
  if (n === 1) return { order: [pins[0]], total: 0 }

  return n <= HELD_KARP_LIMIT
    ? solveHeldKarpWithPins(costMatrix, pins)
    : solveNearestNeighborWithPins(costMatrix, pins)
}

// Convenience wrapper matching the original start/end-only interface -
// equivalent to solveTSPWithPins with pins = {0: startIndex} or
// {0: startIndex, [n-1]: endIndex}.
export function solveTSP(costMatrix, startIndex, endIndex = null) {
  const n = costMatrix.length
  const pins = { 0: startIndex }
  if (endIndex !== null) pins[n - 1] = endIndex
  return solveTSPWithPins(costMatrix, pins)
}

function popcount(x) {
  let count = 0
  while (x) {
    x &= x - 1
    count++
  }
  return count
}

function solveHeldKarpWithPins(costMatrix, pins) {
  const n = costMatrix.length
  const FULL_MASK = (1 << n) - 1
  const startIndex = pins[0]
  const startBit = 1 << startIndex
  const pinnedValues = new Set(Object.values(pins))

  // dp[mask][j] = minimum cost of a path that starts at startIndex, visits
  // exactly the stops in `mask` (in some order respecting the pins), and
  // ends at stop j - where j necessarily occupies position popcount(mask)-1.
  const dp = Array.from({ length: 1 << n }, () => new Array(n).fill(Infinity))
  const parent = Array.from({ length: 1 << n }, () => new Array(n).fill(-1))

  dp[startBit][startIndex] = 0

  for (let mask = startBit; mask <= FULL_MASK; mask++) {
    if ((mask & startBit) === 0) continue // every valid state includes the start
    const placedCount = popcount(mask)
    const nextPosition = placedCount // 0-indexed position the next stop will fill
    const requiredNext = pins[nextPosition]

    for (let j = 0; j < n; j++) {
      const costToJ = dp[mask][j]
      if (costToJ === Infinity) continue
      if (((mask >> j) & 1) === 0) continue

      for (let k = 0; k < n; k++) {
        if ((mask >> k) & 1) continue // k already visited
        if (requiredNext !== undefined ? k !== requiredNext : pinnedValues.has(k)) continue

        const nextMask = mask | (1 << k)
        const candidate = costToJ + costMatrix[j][k]
        if (candidate < dp[nextMask][k]) {
          dp[nextMask][k] = candidate
          parent[nextMask][k] = j
        }
      }
    }
  }

  // With a fixed end (position n-1 pinned), the DP already computed the
  // best cost of visiting everyone and finishing exactly there - just read
  // that cell instead of minimizing over every possible last stop.
  const requiredEnd = pins[n - 1]
  let bestEnd
  let bestCost
  if (requiredEnd !== undefined) {
    bestEnd = requiredEnd
    bestCost = dp[FULL_MASK][requiredEnd]
  } else {
    bestEnd = startIndex
    bestCost = dp[FULL_MASK][startIndex]
    for (let j = 0; j < n; j++) {
      if (dp[FULL_MASK][j] < bestCost) {
        bestCost = dp[FULL_MASK][j]
        bestEnd = j
      }
    }
  }

  const order = []
  let mask = FULL_MASK
  let current = bestEnd
  while (current !== -1) {
    order.push(current)
    const prev = parent[mask][current]
    mask ^= 1 << current
    current = prev
  }
  order.reverse()

  return { order, total: bestCost }
}

function solveNearestNeighborWithPins(costMatrix, pins) {
  const n = costMatrix.length
  const pinnedPositions = new Set(Object.keys(pins).map(Number))
  const order = nearestNeighborPathWithPins(costMatrix, pins, n)
  const improved = twoOptImproveWithPins(order, costMatrix, pinnedPositions)
  return { order: improved, total: pathCost(improved, costMatrix) }
}

// Builds a path left-to-right: pinned positions get their required stop,
// and every open position is filled greedily with whichever unused stop is
// nearest to the previous position's stop.
function nearestNeighborPathWithPins(costMatrix, pins, n) {
  const order = new Array(n).fill(null)
  const visited = new Set(Object.values(pins))
  for (const [position, stopIndex] of Object.entries(pins)) {
    order[Number(position)] = stopIndex
  }

  for (let pos = 0; pos < n; pos++) {
    if (order[pos] !== null) continue
    const prev = order[pos - 1] // position 0 is always pinned, so this always exists
    let nearest = -1
    let nearestCost = Infinity
    for (let candidate = 0; candidate < n; candidate++) {
      if (visited.has(candidate)) continue
      const cost = costMatrix[prev][candidate]
      if (cost < nearestCost) {
        nearestCost = cost
        nearest = candidate
      }
    }
    order[pos] = nearest
    visited.add(nearest)
  }

  return order
}

// Classic 2-opt, restricted to never reverse a range that would move a
// pinned position's stop out of its required slot.
function twoOptImproveWithPins(initialOrder, costMatrix, pinnedPositions) {
  let order = initialOrder.slice()
  const n = order.length
  let improved = true

  while (improved) {
    improved = false
    for (let i = 1; i < n - 1; i++) {
      if (pinnedPositions.has(i)) continue
      for (let k = i + 1; k < n; k++) {
        if (rangeContainsPin(i, k, pinnedPositions)) continue
        const reversed = order.slice()
        reverseSegment(reversed, i, k)
        if (pathCost(reversed, costMatrix) < pathCost(order, costMatrix)) {
          order = reversed
          improved = true
        }
      }
    }
  }

  return order
}

function rangeContainsPin(i, k, pinnedPositions) {
  for (let p = i; p <= k; p++) {
    if (pinnedPositions.has(p)) return true
  }
  return false
}

function reverseSegment(arr, i, k) {
  while (i < k) {
    ;[arr[i], arr[k]] = [arr[k], arr[i]]
    i++
    k--
  }
}

export function pathCost(order, costMatrix) {
  let total = 0
  for (let i = 0; i < order.length - 1; i++) {
    total += costMatrix[order[i]][order[i + 1]]
  }
  return total
}
