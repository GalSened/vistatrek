# VistaTrek - Complete Specifications Document

## 1. Product Overview

### 1.1 Purpose
Nature trip planning web application that prioritizes "the journey" (views, stops, comfort) over pure speed.

### 1.2 Platform
- **Type**: SPA (Single Page Application) - NOT PWA
- **Reason for SPA**: User rejected PWA due to caching issues
- **Target**: Mobile-optimized web application

### 1.3 Core Philosophy
- Zero-cost architecture (no paid APIs)
- Privacy & Offline-first (localStorage, client-side logic)
- "Macro-Meso-Micro" intelligent route planning

---

## 2. Technical Architecture

### 2.1 Stack
| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + TypeScript |
| Maps | Leaflet + React-Leaflet |
| Geospatial | Turf.js (client-side) |
| Backend | Python FastAPI |
| Database | SQLite + SQLAlchemy |
| Routing | OSRM (free, public) |
| POI Data | Overpass API (OSM) |
| AI Chat | LLM API (Gemini/OpenAI) |

### 2.2 External APIs (All Free)
| Service | URL | Purpose |
|---------|-----|---------|
| OSRM | `router.project-osrm.org` | Route calculation |
| Overpass | `overpass-api.de/api/interpreter` | POI queries |
| Nominatim | `nominatim.openstreetmap.org` | Geocoding |

### 2.3 Deep Linking URLs
```
Waze:       https://waze.com/ul?ll={lat},{lon}&navigate=yes
Google:     https://www.google.com/maps/dir/?api=1&destination={lat},{lon}&travelmode=driving
Apple:      http://maps.apple.com/?daddr={lat},{lon}
```

---

## 3. Application Structure (4 Screens)

### 3.1 Dashboard (Home) `/`
**Purpose**: Entry point, quick actions, trip history

**Components**:
- [ ] "Start New Trip" button
- [ ] "Resume Trip" button (if active trip exists)
- [ ] Weather summary widget
- [ ] Recent trips list (last 5)

**Logic**:
- On load: Check localStorage for `active_trip`
- If exists & status === 'active': Redirect to Pilot Mode
- Display recent trips from localStorage

### 3.2 Trip Planner `/planner`
**Purpose**: Create and edit trip itinerary

**Layout**: Split-View
- Top 40%: Interactive Map (Leaflet)
- Bottom 60%: Dynamic Timeline (scrollable)

**Components**:
- [ ] Region/destination search (Nominatim autocomplete)
- [ ] Date picker
- [ ] "Vibe" tags: [Nature] [Chill] [Hard Hiking] [Foodie]
- [ ] Map with route polyline and markers
- [ ] Timeline with draggable stop cards
- [ ] "Add Stop" between existing stops
- [ ] Ghost pins (suggestions not in plan)
- [ ] "Generate Draft" button
- [ ] "Start Engine" button (begins trip)

**Features**:
- [ ] Constraint Solver (auto-recalculate times on changes)
- [ ] Drag-and-drop reordering with debounced OSRM calls
- [ ] "Overbooked day" warning (red timeline)
- [ ] Sunset time validation
- [ ] Food gap warning (4+ hours without food)

### 3.3 Pilot Mode `/pilot`
**Purpose**: Active navigation during trip execution

**Layout**: "Cockpit" design for glancability

**Components**:
- [ ] Trip progress bar (% complete)
- [ ] Current time vs planned time (color-coded)
- [ ] Next destination card (large)
  - Stop name (big)
  - Type icon (coffee/viewpoint/food)
  - ETA
  - "NAVIGATE" button (primary CTA)
- [ ] Mini-map showing current position
- [ ] Control deck:
  - "I'm Here" button (manual arrival)
  - "Skip" button (remove current stop)
  - Chat bubble (floating)

**Features**:
- [ ] WakeLock API (keep screen on)
- [ ] GPS tracking with watchPosition
- [ ] Off-route detection (Turf.js, >500m threshold)
- [ ] Pacing engine (LATE/ON_TIME/EARLY status)
- [ ] Geofence arrival detection (200m radius)
- [ ] Deep link to Waze/Google Maps

### 3.4 Settings `/settings`
**Purpose**: User preferences and profile

**Components**:
- [ ] GPS tracking toggle
- [ ] Smart alerts toggle (off-route notifications)
- [ ] Feedback popups toggle
- [ ] Dark mode toggle
- [ ] User profile sliders:
  - hiking_score (1-10)
  - foodie_score (1-10)
  - patience_score (1-10)
- [ ] Preferred navigation app (Waze/Google/Apple)
- [ ] "Clear trip history" button
- [ ] App version display

---

## 4. Core Algorithms

### 4.1 Macro-Meso-Micro Route Planning

```
MACRO (Framework):
├── Input: Start coords, End coords, Date
├── Process: OSRM route calculation
└── Output: Route polyline, total duration, distance

MESO (Strategic Points):
├── Input: Route polyline
├── Process: Find midpoints, segment route into chunks
└── Output: Strategic stop zones (e.g., "halfway point")

MICRO (Golden Clusters):
├── Input: Zone coordinates, radius
├── Process: Overpass query for POIs
├── Filter: viewpoint + parking + coffee within proximity
└── Output: Ranked "Golden Spots"
```

### 4.2 Golden Cluster Query (Overpass)
```
[out:json];
(
  node["tourism"="viewpoint"](around:{radius},{lat},{lon});
  node["natural"="spring"](around:{radius},{lat},{lon});
  node["amenity"="cafe"](around:{radius},{lat},{lon});
  node["amenity"="parking"](around:{radius},{lat},{lon});
);
out body;
```

### 4.3 Constraint Solver (Frontend)
```
1. Identify Anchors (fixed times: hotel check-in, sunset)
2. Forward Pass:
   - start_time = 08:00
   - For each stop:
     arrival = prev_departure + drive_time
     departure = arrival + stop_duration
3. Validate:
   - Last stop before sunset?
   - >4 hours without food?
   - Total duration feasible?
4. Update:
   - If order changed: recalculate OSRM polyline
```

### 4.4 Pacing Engine (30-second interval)
```javascript
if (currentTime > plannedArrival + 15min) {
  status = "LATE";      // Red
  suggest("Skip coffee?");
} else if (currentTime < plannedArrival - 15min) {
  status = "EARLY";     // Green
  suggest("Add a viewpoint?");
} else {
  status = "ON_TIME";   // Blue
}
```

### 4.5 Off-Route Detection (Turf.js)
```javascript
const distance = turf.pointToLineDistance(
  turf.point([userLon, userLat]),
  turf.lineString(routeCoords),
  { units: 'kilometers' }
);
if (distance > 0.5 && consecutiveOffRoute >= 3) {
  triggerRecalculateModal();
}
```

---

## 5. Data Models

### 5.1 Trip (localStorage: `current_trip`)
```typescript
interface Trip {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'completed';
  created_at: string;  // ISO timestamp
  updated_at: string;

  start_location: Coordinates;
  end_location: Coordinates;
  date: string;  // YYYY-MM-DD

  route: {
    polyline: [number, number][];  // [lon, lat][]
    duration_seconds: number;
    distance_meters: number;
  };

  stops: Stop[];

  execution?: {
    started_at: string;
    current_stop_index: number;
    completed_stops: number[];
  };
}
```

### 5.2 Stop
```typescript
interface Stop {
  id: string;
  name: string;
  type: 'viewpoint' | 'coffee' | 'food' | 'spring' | 'parking' | 'custom';
  coordinates: Coordinates;

  planned_arrival: string;   // ISO timestamp
  planned_departure: string;
  duration_minutes: number;

  osm_id?: number;
  tags?: Record<string, string>;  // OSM tags

  is_anchor: boolean;  // Fixed time point

  actual_arrival?: string;
  actual_departure?: string;
  skipped?: boolean;
}
```

### 5.3 UserProfile (localStorage: `user_profile`)
```typescript
interface UserProfile {
  id: string;
  name?: string;

  hiking_score: number;    // 1-10, default 5
  foodie_score: number;    // 1-10, default 5
  patience_score: number;  // 1-10, default 5

  preferred_nav_app: 'waze' | 'google' | 'apple';

  onboarding_completed: boolean;
}
```

### 5.4 Settings (localStorage: `settings`)
```typescript
interface Settings {
  gps_tracking: boolean;      // default: true
  smart_alerts: boolean;      // default: true
  feedback_popups: boolean;   // default: true
  dark_mode: boolean;         // default: false
}
```

---

## 6. API Contracts

### 6.1 Backend Endpoints

#### `GET /api/plan-trip`
Calculate route and find micro-gems
```
Query params:
  start_lat: float
  start_lon: float
  end_lat: float
  end_lon: float
  date?: string (YYYY-MM-DD)

Response:
{
  "macro_route": {
    "duration_seconds": number,
    "distance_meters": number,
    "polyline": [lon, lat][]
  },
  "micro_stops": Stop[],
  "weather"?: WeatherData
}
```

#### `POST /api/chat-action`
AI agent action endpoint
```
Body:
{
  "text": string,
  "current_trip_id": string,
  "user_location"?: Coordinates
}

Response:
{
  "reply": string,
  "action"?: {
    "type": "add_stop" | "remove_stop" | "reorder" | "recalculate",
    "payload": any
  },
  "updated_trip"?: Trip
}
```

#### `GET /api/search-pois`
Search POIs around a point
```
Query params:
  lat: float
  lon: float
  radius: number (meters)
  types?: string (comma-separated: viewpoint,cafe,parking)

Response:
{
  "pois": POI[]
}
```

#### `GET /api/weather`
Get weather for coordinates
```
Query params:
  lat: float
  lon: float
  date: string

Response:
{
  "sunrise": string,
  "sunset": string,
  "temperature": number,
  "conditions": string
}
```

---

## 7. Edge Cases & Error Handling

| Scenario | Risk | Handling |
|----------|------|----------|
| No Internet | High | Switch to Offline Mode, queue requests, serve cached maps |
| GPS Signal Lost | Medium | Show "Searching..." banner, don't trigger false alerts |
| Browser Tab Closed | Medium | Restore state from localStorage on reopen |
| API Rate Limited | Low | Graceful fallback, show "Service busy" message |
| GPS Permission Denied | Critical | Show modal explaining requirement, offer "Planning Only" mode |
| "Ghost" Arrival | Medium | On reopen, ask "Did you visit X?" if time exceeded |
| Low Battery | Low | Show charging warning, reduce GPS frequency |
| Overbooked Day | Medium | Red timeline, toast "Remove one stop?" |
| OSRM Failure | Low | Fallback: Haversine distance * 60km/h estimate |
| Zero Search Results | Low | AI suggests alternatives |

---

## 8. Security Requirements

### 8.1 Input Validation
- [ ] Sanitize all user text input (XSS prevention)
- [ ] Validate coordinates are valid floats within country bounds
- [ ] Max chat input: 500 characters
- [ ] Strip HTML/JS tags from all inputs

### 8.2 API Security
- [ ] HTTPS enforcement (required for Geolocation API)
- [ ] CORS: Allow only frontend domain
- [ ] Rate limiting on all endpoints
- [ ] No PII storage (use device_id)

### 8.3 Environment
- [ ] API keys in .env (never in client code)
- [ ] No secrets in localStorage

---

## 9. Performance Requirements

### 9.1 Debouncing
- OSRM calls: 500ms debounce during drag operations
- Search autocomplete: 300ms debounce

### 9.2 Caching
- POI data: Cache in localStorage for 24 hours
- Route data: Cache current trip route
- Map tiles: Browser cache (Leaflet default)

### 9.3 Data Sync
- Draft auto-save: On every change to localStorage
- Server sync: Every 30 seconds OR on "Save" click

---

## 10. Acceptance Criteria Checklist

### Home Screen
- [ ] Shows "Start New Trip" when no active trip
- [ ] Shows "Resume Trip" when active trip exists
- [ ] Displays last 5 trips
- [ ] Auto-redirects to Pilot if active trip

### Planner Screen
- [ ] Can search and select destination
- [ ] Can select date
- [ ] Can select "vibe" tags
- [ ] Generates route with OSRM
- [ ] Shows micro-stops from Overpass
- [ ] Can drag-reorder stops
- [ ] Times auto-update on reorder
- [ ] Can add stops between existing
- [ ] Shows overbooked warning
- [ ] "Start Engine" saves and navigates to Pilot

### Pilot Screen
- [ ] Shows next stop prominently
- [ ] "Navigate" opens Waze/Google deep link
- [ ] GPS tracks position
- [ ] Shows pacing status (green/yellow/red)
- [ ] Detects off-route (>500m)
- [ ] "I'm Here" marks stop complete
- [ ] "Skip" removes stop and advances
- [ ] WakeLock keeps screen on
- [ ] Geofence auto-detects arrival

### Settings Screen
- [ ] GPS toggle works
- [ ] Alerts toggle works
- [ ] Feedback toggle works
- [ ] Profile sliders save to localStorage
- [ ] Nav app preference saves
- [ ] Clear history works

### Chat Agent
- [ ] Accessible from all screens
- [ ] Text input works
- [ ] Can add stops via natural language
- [ ] Can modify trip via commands
- [ ] Shows loading state during API call

---

## 11. File Structure (Target)

```
vistatrek/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/
│   │   │   ├── Timeline/
│   │   │   ├── StopCard/
│   │   │   ├── ChatOverlay/
│   │   │   └── common/
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Planner.tsx
│   │   │   ├── Pilot.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   │   ├── useTrip.ts
│   │   │   ├── useSettings.ts
│   │   │   ├── useGeolocation.ts
│   │   │   └── useWakeLock.ts
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── storage.ts
│   │   │   └── navigation.ts
│   │   ├── utils/
│   │   │   ├── geo.ts (Turf.js wrappers)
│   │   │   ├── time.ts
│   │   │   └── validation.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── context/
│   │   │   └── TripContext.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── trips.py
│   │   │   ├── pois.py
│   │   │   └── chat.py
│   │   ├── services/
│   │   │   ├── osrm.py
│   │   │   ├── overpass.py
│   │   │   └── llm.py
│   │   ├── models/
│   │   │   └── schemas.py
│   │   └── utils/
│   │       └── geo.py
│   ├── tests/
│   │   ├── test_osrm.py
│   │   ├── test_overpass.py
│   │   └── test_api.py
│   ├── requirements.txt
│   └── .env.example
│
├── docs/
│   ├── SPECIFICATIONS.md (this file)
│   └── API.md
│
└── README.md
```

---

*Document Version: 1.0*
*Last Updated: 2026-01-18*
*Status: Ready for Implementation*
