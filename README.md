# Route Optimizer

A single-page React + Vite app for planning multi-stop driving routes. Add
locations by address, pick which ones to visit, and get two optimized stop
orders - shortest total distance and fastest total time - calculated
entirely in the browser with the Google Maps Platform APIs.

No backend or database: locations are geocoded and persisted to
`localStorage`, and all API calls (Places, Geocoding, Distance Matrix) run
client-side.

## Features

- Interactive map (Google Maps JavaScript API) with a pin per saved location.
- Places Autocomplete on the address field when adding a location.
- Location list with checkboxes, persisted across page refreshes.
- "Calculate Routes" once 2+ locations are selected, computing:
  - The shortest-distance stop order.
  - The fastest-time stop order (using live traffic when available).
- Both routes drawn as separate colored, toggleable polylines on the map
  (orange = shortest distance, blue = fastest time), plus ordered stop lists
  with total miles/time. If both routes land on the same stop order, the UI
  says so explicitly instead of showing two identical lists.
- Optional end point, in addition to the start point, for both optimized
  routes - the solver then finds the best order visiting every selected stop
  between that fixed start and end instead of ending wherever is cheapest.
- Drag-and-drop manual reordering of either route's stop list, with totals
  recalculated instantly from the already-fetched distance/duration data (no
  extra API calls) and a "reset to optimized order" button per route.
- Pin any stop (📌) at its current position and hit "Recalculate with pins"
  to re-optimize every other stop around it - the exact same solver, just
  constrained to keep pinned stops exactly where they are.
- Per-stop arrival time and dwell-duration editing: set a time on any one
  stop and the rest are estimated automatically (forward and backward)
  using real drive times and each stop's dwell duration, staying in sync as
  you reorder stops or change durations.
- Every route has an "Open in Google Maps" link (a plain maps.google.com
  directions URL - no extra API calls) that opens the current stop order for
  turn-by-turn navigation.
- Save the current state of either route to a day of the week (Monday-Sunday,
  one route per day, persisted to `localStorage`) for quick recall later -
  each saved route keeps its own stop order, totals, and Google Maps link.

## Getting a Google Maps API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create (or select) a project.
2. Enable billing for the project (Google Maps Platform requires a billing
   account, though it comes with a recurring free usage credit).
3. Under **APIs & Services > Library**, enable these APIs:
   - **Maps JavaScript API** - renders the map.
   - **Places API** - powers the address autocomplete field.
   - **Geocoding API** - converts a typed/selected address into coordinates.
   - **Distance Matrix API** - fetches real driving distance/time between stops.
   - **Directions API** - enable this too if you plan to extend the app to
     draw turn-by-turn road geometry instead of straight polylines.
4. Under **APIs & Services > Credentials**, create an **API key**.
5. Restrict the key (recommended): restrict it to the APIs above, and add an
   HTTP referrer restriction for the domain(s)/localhost port you'll run
   this app on.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set VITE_GOOGLE_MAPS_API_KEY=your_key_here
npm run dev
```

Then open the printed local URL (typically http://localhost:5173).

If the API key is missing or invalid, the app shows a banner explaining
what to fix instead of a blank/broken map.

## Available scripts

- `npm run dev` - start the Vite dev server.
- `npm run build` - production build to `dist/`.
- `npm run preview` - preview the production build locally.
- `npm run lint` - run oxlint.

## Project structure

```
src/
  components/
    MapView.jsx          Map, markers, info windows, route polylines
    LocationForm.jsx     Add-location form (Places Autocomplete + geocode fallback)
    LocationList.jsx     Location table with select/delete
    RoutePanel.jsx       Start/end point pickers, calculate button, route results
    RouteStopList.jsx    Drag-and-drop stop list, schedule editing, save-to-day, maps link
    SavedRoutesPanel.jsx Lists routes saved per day of the week
  hooks/
    useGoogleMaps.js    Loads the Maps JS API once and reports ready/error state
  lib/
    geocode.js          Promise wrapper around google.maps.Geocoder
    distanceMatrix.js   Fetches the distance/duration matrix for selected stops
    tsp.js              TSP solver (Held-Karp exact + nearest-neighbor/2-opt fallback)
    computeRoutes.js    Combines the matrix + solver into the two route results
    schedule.js         Per-stop arrival time propagation from a single anchor stop
    mapsLink.js          Builds a Google Maps directions URL from a stop order
    storage.js           localStorage persistence for saved locations
    savedRoutes.js        localStorage persistence for routes saved per day
```

## How routes are calculated

For the selected stops, the app fetches a full pairwise driving distance
(miles) and driving time (minutes, with live traffic where available) matrix
from the Distance Matrix API, then solves two instances of the traveling
salesman problem against that matrix - fixed starting stop, optionally a
fixed end stop too - once minimizing total distance and once minimizing
total time. Without a fixed end, the path finishes wherever is cheapest.

The same solver also powers "Recalculate with pins": position 0 (the
current start) and any stop you pin are treated as fixed positions, and the
solver re-optimizes only the remaining, unpinned stops around them - it's
the general form of the fixed-start/fixed-end solve above, just extended to
any position in the list.

`src/lib/tsp.js` picks the solving method based on stop count:

- **Up to 12 stops:** exact Held-Karp dynamic programming
  (`O(2^n * n^2)`), guaranteeing the true optimum.
- **More than 12 stops:** Held-Karp's state space grows exponentially, so it
  falls back to a nearest-neighbor construction followed by 2-opt local
  search, which stays fast and typically lands close to optimal.

## Notes and limitations

- All Google API calls happen in the browser, so your API key is visible to
  anyone using the deployed app. Restrict it (HTTP referrers + API list) in
  the Cloud Console before deploying anywhere public.
- Route polylines are drawn as straight lines between stops in visiting
  order, not the actual road geometry - wire up the Directions API per-leg
  if you want the roads themselves drawn.
- Only locations are persisted to `localStorage`; the current selection and
  last-calculated routes reset on page refresh.
