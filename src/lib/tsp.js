// Solves the "open path" traveling salesman problem: given a cost matrix
// between N stops and a fixed starting stop, find the visiting order that
// minimizes total cost, ending wherever is cheapest (there is no
// requirement to return to the start).
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

export function solveTSP(costMatrix, startIndex) {
  const n = costMatrix.length
  if (n === 0) return { order: [], total: 0 }
  if (n === 1) return { order: [startIndex], total: 0 }

  return n <= HELD_KARP_LIMIT
    ? solveHeldKarp(costMatrix, startIndex)
    : solveNearestNeighborWith2Opt(costMatrix, startIndex)
}

function solveHeldKarp(costMatrix, startIndex) {
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

  let bestEnd = startIndex
  let bestCost = dp[FULL_MASK][startIndex]
  for (let j = 0; j < n; j++) {
    if (dp[FULL_MASK][j] < bestCost) {
      bestCost = dp[FULL_MASK][j]
      bestEnd = j
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

function solveNearestNeighborWith2Opt(costMatrix, startIndex) {
  const order = nearestNeighborPath(costMatrix, startIndex)
  const improved = twoOptImprove(order, costMatrix)
  return { order: improved, total: pathCost(improved, costMatrix) }
}

function nearestNeighborPath(costMatrix, startIndex) {
  const n = costMatrix.length
  const visited = new Set([startIndex])
  const order = [startIndex]

  while (order.length < n) {
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

  return order
}

// Classic 2-opt: repeatedly reverse a segment of the path if doing so
// shortens it, until no single reversal helps. The start of the path (index
// 0) is left fixed since the route must begin at the chosen start location.
function twoOptImprove(initialOrder, costMatrix) {
  let order = initialOrder.slice()
  const n = order.length
  let improved = true

  while (improved) {
    improved = false
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
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
