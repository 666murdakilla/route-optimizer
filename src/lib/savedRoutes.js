const STORAGE_KEY = 'route-optimizer:savedRoutes'

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// One saved route slot per day of the week - saving to a day that already
// has a route overwrites it, matching "this is my Monday route" rather than
// keeping a history of every save.
function emptySavedRoutes() {
  return DAYS_OF_WEEK.reduce((acc, day) => {
    acc[day] = null
    return acc
  }, {})
}

export function loadSavedRoutes() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return DAYS_OF_WEEK.reduce((acc, day) => {
      acc[day] = parsed[day] ?? null
      return acc
    }, {})
  } catch {
    return emptySavedRoutes()
  }
}

export function saveSavedRoutes(savedRoutes) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRoutes))
  } catch {
    // localStorage unavailable - fail silently, same as lib/storage.js.
  }
}
