export default function LocationList({ locations, selectedIds, onToggleSelect, onDelete }) {
  if (locations.length === 0) {
    return <p className="empty-state">No locations yet. Add one above to get started.</p>
  }

  return (
    <table className="location-table">
      <thead>
        <tr>
          <th aria-label="Select" />
          <th>Company</th>
          <th>Address</th>
          <th aria-label="Delete" />
        </tr>
      </thead>
      <tbody>
        {locations.map((loc) => (
          <tr key={loc.id}>
            <td>
              <input
                type="checkbox"
                checked={selectedIds.has(loc.id)}
                onChange={() => onToggleSelect(loc.id)}
                aria-label={`Select ${loc.name}`}
              />
            </td>
            <td>{loc.name}</td>
            <td className="address-cell">{loc.address}</td>
            <td>
              <button
                type="button"
                className="delete-btn"
                onClick={() => onDelete(loc.id)}
                aria-label={`Delete ${loc.name}`}
              >
                ✕
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
