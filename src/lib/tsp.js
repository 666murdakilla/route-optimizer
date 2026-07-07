// Solves the "open path" traveling salesman problem: given a cost matrix
// between N stops and a fixed starting stop, find the visiting order that
// minimizes total cost. If an end stop is also fixed, the path must finish
// there; otherwise it ends wherever is cheapest (no requirement to return
// to the start).
//
// Method selection:
//   - N <= HELD_KARP_LIMIT: exact Held-Karp dynamic programming,
//     O(2^N * N^2) time / O(2^N * N) space. For N=12 that's ~4096 * 144
//     table entries - trivial for a browser, and it guarantees the true
//     optimum (nearest-neighbor heuristics can be badly wrong on
//     adversarial layouts).
//   - N > HELD_KARP_LIMIT: Held-Karp's state space explodes exponentially
//     (2^N), so we fall back to a nearest-neighbor construction followed by
//     2-opt local search. This is O(N^2) to build plus O(N^2) per 2-opt
//     pass, which stays fast for dozens of stops and typically lands within
//     a few percent of optimal.
//
// The cost matrix is asymmetric-safe (costMatrix[i][j] need not equal
// costMatrix[j][i]), since real driving distance/time often isn't
// symmetric (one-way streets, highway ramps, traffic direction).

const HELD_KARP_LIMIT = 12

export function solveTSP(costMatrix, startIndex, endIndex = null) {
  const n = costMatrix.length
  if (n === 0) return { order: [], total: 0 }
  if (n === 1) return { order: [startIndex], total: 0 }

  return n <= HELD_KARP_LIMIT
    ? solveHeldKarp(costMatrix, startIndex, endIndex)
    : solveNearestNeighborWith2Opt(costMatrix, startIndex, endIndex)
}

function solveHeldKarp(costMatrix, startIndex, endIndex) {
  const n = costMatrix.length
  const FULL_MASK = (1 << n) - 1
  const startBit = 1 << startIndex

  // dp[mask][j] = minimum cost of a path that starts at startIndex, visits
  // exactly the stops in `mask`, and ends at stop j.
  const dp = Array.from({ length: 1 << n }, () => new Array(n).fill(Infinity))
  const parent = Array.from({ length: 1 << n }, () => new Array(n).fill(-1))

  dp[startBit][startIndex] = 0

  for (let mask = startBit; mask <= FULL_MASK; mask++) {
    if ((mask & startBit) === 0) continue // every valid state includes the start
    for (let j = 0; j < n; j++) {
      const costToJ = dp[mask][j]
      if (costToJ === Infinity) continue
      if (((mask >> j) & 1) === 0) continue

      for (let k = 0; k < n; k++) {
        if ((mask >> k) & 1) continue // k already visited
        const nextMask = mask | (1 << k)
        const candidate = costToJ + costMatrix[j][k]
        if (candidate < dp[nextMask][k]) {
          dp[nextMask][k] = candidate
          parent[nextMask][k] = j
        }
      }
    }
  }

  // With a fixed end, the DP already computed the best cost of visiting
  // everyone and finishing exactly at endIndex - just read that cell
  // instead of minimizing over every possible last stop.
  let bestEnd
  let bestCost
  if (endIndex !== null) {
    bestEnd = endIndex
    bestCost = dp[FULL_MASK][endIndex]
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

function solveNearestNeighborWith2Opt(costMatrix, startIndex, endIndex) {
  const order = nearestNeighborPath(costMatrix, startIndex, endIndex)
  const improved = twoOptImprove(order, costMatrix, endIndex !== null)
  return { order: improved, total: pathCost(improved, costMatrix) }
}

// Builds a greedy path start -> ... -> (endIndex, if fixed) by always
// hopping to the nearest unvisited stop. When an end is fixed, it's held
// out of the greedy selection and appended last so the path still finishes
// there.
function nearestNeighborPath(costMatrix, startIndex, endIndex) {
  const n = costMatrix.length
  const visited = new Set([startIndex])
  if (endIndex !== null) visited.add(endIndex)
  const order = [startIndex]
  const stopsToVisit = endIndex !== null ? n - 1 : n

  while (order.length < stopsToVisit) {
    const current = order[order.length - 1]
    let nearest = -1
    let nearestCost = Infinity
    for (let candidate = 0; candidate < n; candidate++) {
      if (visited.has(candidate)) continue
      const cost = costMatrix[current][candidate]
      if (cost < nearestCost) {
        nearestCost = cost
        nearest = candidate
      }
    }
    visited.add(nearest)
    order.push(nearest)
  }

  if (endIndex !== null) order.push(endIndex)

  return order
}

// Classic 2-opt: repeatedly reverse a segment of the path if doing so
// shortens it, until no single reversal helps. The start of the path (index
// 0) is always left fixed. When fixedEnd is true, the last index is also
// left fixed so the path still finishes at the required end stop.
function twoOptImprove(initialOrder, costMatrix, fixedEnd) {
  let order = initialOrder.slice()
  const n = order.length
  const kBound = fixedEnd ? n - 1 : n
  let improved = true

  while (improved) {
    improved = false
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < kBound; k++) {
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
