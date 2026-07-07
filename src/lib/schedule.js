// Computes estimated arrival times for every stop in a route, given a single
// "anchor" stop with a known arrival time. Times are expressed as minutes
// since midnight (can go negative or past 1440 if the route spans a day
// boundary) so the UI can format them however it likes.
//
// Propagation is two-directional from the anchor:
//   - Stops after it: previous arrival + dwell time at the previous stop +
//     drive time from the previous stop to this one.
//   - Stops before it: next arrival - drive time to the next stop - this
//     stop's own dwell time.
//
// `order` is the current (possibly manually reordered) stop sequence,
// `referenceLocations`/`durationMinutes` are the fixed matrix this route was
// originally solved against (reordering never changes which stops are
// involved, so the same duration matrix still applies), and `stopDurations`
// maps location id -> minutes to spend at that stop (defaulting to 0).
export function computeArrivalMinutes(order, referenceLocations, durationMinutes, stopDurations, anchor) {
  if (!anchor) return order.map(() => null)

  const anchorPos = order.findIndex((loc) => loc.id === anchor.locationId)
  if (anchorPos === -1) return order.map(() => null)

  const indexById = new Map(referenceLocations.map((loc, i) => [loc.id, i]))
  const dwellAt = (loc) => stopDurations[loc.id] ?? 0
  const travelTime = (from, to) => durationMinutes[indexById.get(from.id)][indexById.get(to.id)]

  const times = new Array(order.length).fill(null)
  times[anchorPos] = parseTimeToMinutes(anchor.time)

  for (let i = anchorPos + 1; i < order.length; i++) {
    times[i] = times[i - 1] + dwellAt(order[i - 1]) + travelTime(order[i - 1], order[i])
  }
  for (let i = anchorPos - 1; i >= 0; i--) {
    times[i] = times[i + 1] - travelTime(order[i], order[i + 1]) - dwellAt(order[i])
  }

  return times
}

// "HH:MM" (the format <input type="time"> uses) -> minutes since midnight.
export function parseTimeToMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return hours * 60 + minutes
}

const DAY_MINUTES = 24 * 60

// Minutes since midnight (possibly outside 0-1440) -> "HH:MM" for the
// <input type="time"> value, wrapped into a single day.
export function minutesToInputValue(totalMinutes) {
  const dayOffset = Math.floor(totalMinutes / DAY_MINUTES)
  const normalized = Math.round(totalMinutes - dayOffset * DAY_MINUTES)
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// How many days off from the anchor's day this time falls on, for display
// next to a wrapped time (e.g. "+1d" when a route runs past midnight).
export function dayOffsetLabel(totalMinutes) {
  const dayOffset = Math.floor(totalMinutes / DAY_MINUTES)
  if (dayOffset === 0) return ''
  return dayOffset > 0 ? `+${dayOffset}d` : `${dayOffset}d`
}

export function formatDurationMinutes(totalMinutes) {
  const rounded = Math.round(totalMinutes)
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`
}
