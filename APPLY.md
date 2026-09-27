# How to apply this update

Copy these files over the same paths in your project:

```
src/core/terminator.ts                  (replace — exports getSolarAltitudeDeg now)
src/render/flightRenderer.ts            (replace — night lighting)
src/components/AirportSearch.tsx        (replace — keyboard nav: ↑ ↓ Enter Esc)
src/components/FlightRouteSearch.tsx    (new — the smart origin→destination search bar)
src/components/ControlsPanel.tsx        (replace — uses FlightRouteSearch)
src/index.css                           (append the new rules at the bottom, or replace)
```

No new npm packages, no data regeneration needed — this is UI/rendering logic only.

## What changed
- **Launch a virtual flight** is now one search box: type → pick origin (↑/↓ + Enter or
  click) → the same box immediately asks for the destination, pre-listing real scheduled
  destinations from that origin before you even type. Picking either flies the camera to it.
  Diversion airports are still fully automatic (nearest-first along the path), with more
  required the longer the route.
- Aircraft icons now react to real day/night at their current position: the fuselage dims
  slightly, and at night you'll see a red light on the left wingtip, green on the right
  (standard aviation convention), a white tail light, and a brief white anti-collision flash
  — all fading in gradually around sunset/sunrise rather than snapping on.
