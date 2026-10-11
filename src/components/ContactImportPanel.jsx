import { useState } from 'react'
import { parseContactLines, matchContactsToLocations } from '../lib/contactImport'

// A paste box for contact rows copied straight from a Google Docs/Sheets
// table (Name, Phone, Address columns). Matches by name against existing
// locations and fills in their phone number - never creates new locations,
// since geocoding a new address needs the full add-location flow.
export default function ContactImportPanel({ locations, onImport }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)

  function handleImport() {
    const { contacts, skipped } = parseContactLines(text)
    const { locations: updatedLocations, matchedNames, unmatchedNames } = matchContactsToLocations(
      contacts,
      locations,
    )
    onImport(updatedLocations)
    setResult({ matchedNames, unmatchedNames, skipped })
    setText('')
  }

  return (
    <div className="contact-import-panel">
      <h2>Import contact info</h2>
      <p className="panel-hint">
        Paste rows copied from a Google Docs/Sheets table - one contact per line, columns in order
        Name, Phone, Address. Matches by name against your saved locations to fill in phone numbers.
      </p>
      <textarea
        className="contact-import-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Alpha HQ\t555-123-4567\t100 Alpha St\nBravo Depot\t555-987-6543\t200 Bravo Ave'}
        rows={4}
      />
      <button type="button" onClick={handleImport} disabled={!text.trim()}>
        Match &amp; update phone numbers
      </button>

      {result && (
        <div className="contact-import-result">
          {result.matchedNames.length > 0 && (
            <p>
              Matched {result.matchedNames.length}: {result.matchedNames.join(', ')}
            </p>
          )}
          {result.unmatchedNames.length > 0 && (
            <p className="form-error">
              No matching location for: {result.unmatchedNames.join(', ')}
            </p>
          )}
          {result.skipped.length > 0 && (
            <p className="form-error">
              Couldn't read {result.skipped.length} line(s) - each needs Name, Phone, and Address
              separated by tabs (line {result.skipped.map((s) => s.line).join(', ')}).
            </p>
          )}
          {result.matchedNames.length === 0 && result.unmatchedNames.length === 0 && result.skipped.length === 0 && (
            <p className="form-error">Nothing to import - paste some contact rows first.</p>
          )}
        </div>
      )}
    </div>
  )
}
