export function formatDurationMinutes(totalMinutes) {
  const rounded = Math.round(totalMinutes)
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`
}
