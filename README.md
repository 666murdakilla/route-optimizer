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
- Per-stop arrival time and dwell-duration editing: every stop has its own
  independent time field - setting one never changes any other stop's time.
  The dwell duration only affects that stop's own calendar event length (see
  calendar export below).
- Every route has an "Open in Google Maps" link (a plain maps.google.com
  directions URL - no extra API calls) that opens the current stop order for
  turn-by-turn navigation.
- Save the current state of either route - stop order, pins, arrival times,
  and dwell durations - to a day of the week (Monday-Sunday, one route per
  day, persisted to `localStorage`). A "Reopen" button on each saved route
  brings it back into the Calculate section, fully editable again, with
  everything restored exactly as saved; the other route type (whichever
  wasn't saved) gets its own freshly-optimized order alongside it.
- Import contact info by pasting rows copied from a Google Docs/Sheets table
  (Name, Phone, Address) - matches by name against your saved locations to
  fill in phone numbers, no Google sign-in involved.
- Export a route to a calendar file (`.ics`) once you've picked a date and
  set at least one stop's arrival time - one event per stop that has a time
  set, using that time, its address, and phone number, ready to import into
  Google/Apple/Outlook calendars with a click. This and the contact import
  above are both plain client-side file handling - no OAuth/Google sign-in
  required; reading a Doc live or writing directly to Calendar would need
  that instead (a heavier lift - see "Notes and limitations").

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
    schedule.js         Formats total trip minutes as "X hr Y min"
    mapsLink.js          Builds a Google Maps directions URL from a stop order
    contactImport.js     Parses pasted contact rows and matches them to locations by name
    calendarExport.js    Builds a downloadable .ics calendar file for a route
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
- Contact import and calendar export are both plain client-side file
  handling (a paste box and a downloaded `.ics` file) - no Google sign-in.
  Live-reading a Google Doc or writing events directly into Google Calendar
  would need real OAuth (a sign-in flow, a consent screen, and - since this
  app won't go through Google's app verification - staying in "Testing"
  mode with an explicit list of allowed accounts and an "unverified app"
  warning on every sign-in).
