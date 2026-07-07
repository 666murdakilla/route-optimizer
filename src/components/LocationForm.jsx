import { useEffect, useRef, useState } from 'react'
import { geocodeAddress } from '../lib/geocode'

export default function LocationForm({ onAdd }) {
  const [name, setName] = useState('')
  const [addressText, setAddressText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const addressInputRef = useRef(null)
  const autocompleteRef = useRef(null)
  // Holds lat/lng captured directly from a chosen Autocomplete suggestion,
  // so we can skip a redundant geocode call when the user didn't edit it.
  const selectedPlaceRef = useRef(null)

  useEffect(() => {
    if (!addressInputRef.current || autocompleteRef.current) return

    const autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      fields: ['formatted_address', 'geometry'],
    })
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (place?.geometry?.location) {
        const resolved = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          address: place.formatted_address ?? addressInputRef.current.value,
        }
        selectedPlaceRef.current = resolved
        setAddressText(resolved.address)
      } else {
        selectedPlaceRef.current = null
      }
    })
    autocompleteRef.current = autocomplete
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedAddress = addressInputRef.current.value.trim()

    if (!trimmedName || !trimmedAddress) {
      setError('Please enter both a company name and an address.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const resolved =
        selectedPlaceRef.current && selectedPlaceRef.current.address === trimmedAddress
          ? selectedPlaceRef.current
          : await geocodeAddress(trimmedAddress)

      onAdd({
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: trimmedName,
        address: resolved.address,
        lat: resolved.lat,
        lng: resolved.lng,
      })

      setName('')
      setAddressText('')
      addressInputRef.current.value = ''
      selectedPlaceRef.current = null
    } catch (err) {
      setError(err.message || 'Could not find that address. Please try a different one.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="location-form" onSubmit={handleSubmit}>
      <h2>Add a location</h2>
      <label className="field">
        <span>Company name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Corp"
          disabled={loading}
        />
      </label>
      <label className="field">
        <span>Address</span>
        <input
          type="text"
          ref={addressInputRef}
          defaultValue=""
          onChange={(e) => {
            setAddressText(e.target.value)
            selectedPlaceRef.current = null
          }}
          placeholder="Start typing an address..."
          disabled={loading}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={loading || !name.trim() || !addressText.trim()}>
        {loading ? 'Adding…' : 'Add location'}
      </button>
    </form>
  )
}
