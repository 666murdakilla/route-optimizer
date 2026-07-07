const LOCATIONS_KEY = 'route-optimizer:locations'

export function loadLocations() {
  try {
    const raw = window.localStorage.getItem(LOCATIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocations(locations) {
  try {
    window.localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations))
  } catch {
    // localStorage unavailable (e.g. private browsing quota) - fail silently,
    // the app still works for the current session.
  }
}
