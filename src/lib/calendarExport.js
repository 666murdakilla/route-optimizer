import { computeArrivalMinutes } from './schedule.js'

// Builds a standard .ics (iCalendar) file for a route - one VEVENT per stop,
// using the same anchor-based arrival times already computed for display
// (see lib/schedule.js), combined with a calendar date the user picks. No
// Google sign-in needed: this is a plain file the browser downloads, which
// any calendar app (Google, Apple, Outlook) can import.
//
// Returns null if there's no anchor time set yet - without one, arrival
// times are all unknown, so there's nothing to schedule.
export function buildIcsCalendar(order, scheduleDate, stopDurations, anchor, durationMinutes, referenceLocations, phoneByLocationId) {
  if (!anchor || !scheduleDate) return null

  const arrivalMinutes = computeArrivalMinutes(order, referenceLocations, durationMinutes, stopDurations, anchor)
  if (arrivalMinutes.every((m) => m === null)) return null

  const now = formatIcsDateTime(new Date(), true)
  const events = order
    .map((loc, i) => {
      if (arrivalMinutes[i] === null) return null
      const start = dateTimeFromSchedule(scheduleDate, arrivalMinutes[i])
      const durationMins = Math.max(stopDurations[loc.id] ?? 0, 15)
      const end = new Date(start.getTime() + durationMins * 60000)
      const phone = phoneByLocationId[loc.id]

      return [
        'BEGIN:VEVENT',
        `UID:${loc.id}-${scheduleDate}@route-optimizer`,
        `DTSTAMP:${now}`,
        `DTSTART:${formatIcsDateTime(start)}`,
        `DTEND:${formatIcsDateTime(end)}`,
        `SUMMARY:${escapeIcsText(loc.name)}`,
        `LOCATION:${escapeIcsText(loc.address)}`,
        `DESCRIPTION:${escapeIcsText(phone ? `Phone: ${phone}` : 'No phone on file')}`,
        'END:VEVENT',
      ].join('\r\n')
    })
    .filter(Boolean)

  if (events.length === 0) return null

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Route Optimizer//EN', ...events, 'END:VCALENDAR'].join(
    '\r\n',
  )
}

function dateTimeFromSchedule(scheduleDate, minutesSinceMidnight) {
  const [year, month, day] = scheduleDate.split('-').map(Number)
  const dt = new Date(year, month - 1, day, 0, 0, 0, 0)
  dt.setMinutes(dt.getMinutes() + minutesSinceMidnight)
  return dt
}

// `utc` formats using UTC components (for DTSTAMP, which must be UTC);
// otherwise formats local wall-clock time as a "floating" time with no
// timezone, which is what DTSTART/DTEND want here.
function formatIcsDateTime(date, utc = false) {
  const pad = (n) => String(n).padStart(2, '0')
  const year = utc ? date.getUTCFullYear() : date.getFullYear()
  const month = pad((utc ? date.getUTCMonth() : date.getMonth()) + 1)
  const day = pad(utc ? date.getUTCDate() : date.getDate())
  const hours = pad(utc ? date.getUTCHours() : date.getHours())
  const minutes = pad(utc ? date.getUTCMinutes() : date.getMinutes())
  const seconds = pad(utc ? date.getUTCSeconds() : date.getSeconds())
  return `${year}${month}${day}T${hours}${minutes}${seconds}${utc ? 'Z' : ''}`
}

function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// Triggers a browser download of the given text content - no server
// involved, just a client-side Blob and a temporary link click.
export function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
