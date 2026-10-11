// Parses contact rows pasted from a Google Docs/Sheets table. Pasting a
// table into a plain text box preserves tabs between columns and newlines
// between rows, so we require tab-separated "Name<TAB>Phone<TAB>Address"
// per line - tabs never appear inside an address, unlike commas, so this
// avoids ambiguity a comma-separated format would have.
export function parseContactLines(text) {
  const contacts = []
  const skipped = []

  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line, index) => {
      const fields = line.split('\t').map((f) => f.trim())
      if (fields.length !== 3 || fields.some((f) => f === '')) {
        skipped.push({ line: index + 1, text: line })
        return
      }
      const [name, phone, address] = fields
      contacts.push({ name, phone, address })
    })

  return { contacts, skipped }
}

// Matches parsed contacts to existing locations by exact, case-insensitive
// name match, and returns an updated locations array with phone numbers
// filled in. Never creates new locations - a contact with no matching name
// is reported back as unmatched rather than guessed at.
export function matchContactsToLocations(contacts, locations) {
  const byNormalizedName = new Map(locations.map((loc) => [loc.name.trim().toLowerCase(), loc]))

  const matchedNames = []
  const unmatchedNames = []

  const updatedById = new Map()
  for (const contact of contacts) {
    const match = byNormalizedName.get(contact.name.trim().toLowerCase())
    if (match) {
      matchedNames.push(contact.name)
      updatedById.set(match.id, contact.phone)
    } else {
      unmatchedNames.push(contact.name)
    }
  }

  const updatedLocations = locations.map((loc) =>
    updatedById.has(loc.id) ? { ...loc, phone: updatedById.get(loc.id) } : loc,
  )

  return { locations: updatedLocations, matchedNames, unmatchedNames }
}
