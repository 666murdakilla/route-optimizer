// Builds a standard .ics (iCalendar) file for a route - one VEVENT per stop
// that has a manually-set time, combined with a calendar date the user
// picks. No Google sign-in needed: this is a plain file the browser
// downloads, which any calendar app (Google, Apple, Outlook) can import.
//
// `times` maps location id -> "HH:MM" (only stops the user actually typed a
// time into have an entry); stops with no time set are skipped since there's
// nothing to schedule them at. Returns null if there's no date, or no stop
// has a time set at all.
export function buildIcsCalendar(order, scheduleDate, stopDurations, times, phoneByLocationId) {
  if (!scheduleDate) return null

  const now = formatIcsDateTime(new Date(), true)
  const events = order
    .map((loc) => {
      const time = times[loc.id]
      if (!time) return null

      const start = dateTimeFromSchedule(scheduleDate, time)
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

function dateTimeFromSchedule(scheduleDate, hhmm) {
  const [year, month, day] = scheduleDate.split('-').map(Number)
  const [hours, minutes] = hhmm.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
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
