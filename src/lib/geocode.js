// Thin promise wrapper around the Google Geocoder, used as a fallback when
// the user types (or edits) an address instead of picking a Places
// Autocomplete suggestion.
export function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    const geocoder = new window.google.maps.Geocoder()
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const location = results[0].geometry.location
        resolve({
          lat: location.lat(),
          lng: location.lng(),
          address: results[0].formatted_address,
        })
      } else {
        reject(new Error(`Could not find that address (${status}).`))
      }
    })
  })
}
