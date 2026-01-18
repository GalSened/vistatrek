# VistaTrek - Technical Design Document (TDD)

## 1. System Architecture

### 1.1 High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   React     │  │   Leaflet   │  │      localStorage       │  │
│  │    App      │──│    Maps     │  │  ┌─────────┬─────────┐  │  │
│  │             │  │             │  │  │  trips  │settings │  │  │
│  └──────┬──────┘  └─────────────┘  │  └─────────┴─────────┘  │  │
│         │                          └─────────────────────────┘  │
│         │  Turf.js (client-side geo calculations)               │
└─────────┼───────────────────────────────────────────────────────┘
          │ HTTP/REST
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Routers   │  │  Services   │  │       SQLite DB         │  │
│  │  /trips     │──│  osrm.py    │  │  ┌─────────┬─────────┐  │  │
│  │  /pois      │  │  overpass   │  │  │  users  │ trips   │  │  │
│  │  /chat      │  │  llm.py     │  │  └─────────┴─────────┘  │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │   OSRM   │    │ Overpass │    │   LLM    │
    │  Public  │    │   API    │    │   API    │
    └──────────┘    └──────────┘    └──────────┘
```

### 1.2 Data Flow: Trip Planning

```
User Input (destination, date, vibes)
         │
         ▼
┌─────────────────────────────────┐
│  1. MACRO: Route Calculation    │
│     - Call OSRM for driving     │
│     - Get polyline + duration   │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│  2. MESO: Strategic Points      │
│     - Segment route into chunks │
│     - Identify midpoints        │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│  3. MICRO: Golden Clusters      │
│     - Query Overpass per zone   │
│     - Filter by user profile    │
│     - Rank by proximity score   │
└─────────────┬───────────────────┘
              ▼
┌─────────────────────────────────┐
│  4. OUTPUT: Trip JSON           │
│     - Route polyline            │
│     - Ordered stops with times  │
│     - Alternatives (ghost pins) │
└─────────────────────────────────┘
```

---

## 2. Frontend Architecture

### 2.1 Component Hierarchy

```
App
├── UserProvider (Context)
│   └── TripProvider (Context)
│       ├── Home
│       │   ├── TripCard (recent trips)
│       │   └── WeatherWidget
│       │
│       ├── Planner
│       │   ├── PlannerHeader
│       │   │   ├── DestinationSearch
│       │   │   ├── DatePicker
│       │   │   └── VibeTags
│       │   ├── MapCanvas
│       │   │   ├── RoutePolyline
│       │   │   ├── StopMarkers
│       │   │   └── GhostMarkers
│       │   ├── Timeline
│       │   │   ├── TimelineStop (draggable)
│       │   │   └── TransitionBlock
│       │   └── ActionBar
│       │
│       ├── Pilot
│       │   ├── PilotHeader (progress bar)
│       │   ├── NextStopCard
│       │   ├── MiniMap
│       │   ├── PacingBar
│       │   └── ControlDeck
│       │
│       ├── Settings
│       │   ├── ToggleSection
│       │   ├── ProfileSliders
│       │   └── DataManagement
│       │
│       └── ChatOverlay (global, floating)
           ├── MessageList
           └── InputBar
```

### 2.2 State Management Strategy

**Global State (Context)**:
- `UserContext`: User profile, settings
- `TripContext`: Active trip, trip history

**Local State (useState/useReducer)**:
- Component-specific UI state
- Form inputs
- Loading/error states

**Persistent State (localStorage)**:
- `current_trip`: Active trip JSON
- `trip_history`: Array of past trips
- `user_profile`: User preferences
- `settings`: App settings

### 2.3 Custom Hooks

```typescript
// useTrip.ts - Trip management
const {
  trip,
  updateStop,
  addStop,
  removeStop,
  reorderStops,
  startTrip,
  completeStop
} = useTrip();

// useGeolocation.ts - GPS tracking
const {
  position,
  error,
  isTracking,
  startTracking,
  stopTracking
} = useGeolocation();

// useWakeLock.ts - Screen wake
const {
  isLocked,
  requestWakeLock,
  releaseWakeLock
} = useWakeLock();

// useSettings.ts - App settings
const {
  settings,
  toggleSetting,
  updateProfile
} = useSettings();

// useOffRoute.ts - Route deviation detection
const {
  isOffRoute,
  distance,
  checkPosition
} = useOffRoute(routePolyline);
```

### 2.4 Routing Strategy

```typescript
// React Router configuration
const routes = [
  { path: '/', element: <Home /> },
  { path: '/planner', element: <Planner /> },
  { path: '/planner/:tripId', element: <Planner /> },  // Edit existing
  { path: '/pilot', element: <Pilot /> },
  { path: '/settings', element: <Settings /> }
];

// Protected route: Pilot requires active trip
// Redirect to Home if no active trip
```

---

## 3. Backend Architecture

### 3.1 FastAPI Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, CORS, startup
│   ├── config.py            # Environment variables
│   ├── dependencies.py      # Dependency injection
│   │
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── trips.py         # /api/trips endpoints
│   │   ├── pois.py          # /api/pois endpoints
│   │   └── chat.py          # /api/chat endpoints
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── osrm.py          # OSRM client
│   │   ├── overpass.py      # Overpass API client
│   │   ├── clustering.py    # Golden cluster algorithm
│   │   ├── llm.py           # LLM integration
│   │   └── weather.py       # Weather API (optional)
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── database.py      # SQLAlchemy setup
│   │   ├── schemas.py       # Pydantic models
│   │   └── orm.py           # SQLAlchemy ORM models
│   │
│   └── utils/
│       ├── __init__.py
│       ├── geo.py           # Geospatial utilities
│       └── validation.py    # Input validation
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Pytest fixtures
│   ├── test_osrm.py
│   ├── test_overpass.py
│   ├── test_clustering.py
│   └── test_api.py
│
├── requirements.txt
├── requirements-dev.txt
├── .env.example
└── pytest.ini
```

### 3.2 API Endpoint Design

```python
# trips.py
@router.get("/plan")
async def plan_trip(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    date: Optional[str] = None,
    vibes: Optional[str] = None  # comma-separated
) -> TripPlanResponse:
    """Generate trip plan with route and stops."""

@router.post("/validate")
async def validate_trip(trip: TripInput) -> ValidationResponse:
    """Validate trip constraints (time, feasibility)."""

# pois.py
@router.get("/search")
async def search_pois(
    lat: float,
    lon: float,
    radius: int = 2000,
    types: Optional[str] = None
) -> List[POI]:
    """Search POIs around a point."""

@router.get("/along-route")
async def pois_along_route(
    polyline: str,  # encoded polyline
    buffer_km: float = 5.0,
    types: Optional[str] = None
) -> List[POI]:
    """Find POIs along a route corridor."""

# chat.py
@router.post("/action")
async def chat_action(request: ChatRequest) -> ChatResponse:
    """Process natural language command."""
```

### 3.3 Service Layer Design

```python
# osrm.py
class OSRMService:
    BASE_URL = "http://router.project-osrm.org"

    async def get_route(
        self,
        start: Coordinates,
        end: Coordinates
    ) -> RouteResult:
        """Get driving route between two points."""

    async def get_route_with_waypoints(
        self,
        waypoints: List[Coordinates]
    ) -> RouteResult:
        """Get route through multiple waypoints."""

# overpass.py
class OverpassService:
    BASE_URL = "http://overpass-api.de/api/interpreter"

    async def query_pois(
        self,
        lat: float,
        lon: float,
        radius: int,
        poi_types: List[str]
    ) -> List[POI]:
        """Query OSM for POIs."""

    def build_query(
        self,
        lat: float,
        lon: float,
        radius: int,
        poi_types: List[str]
    ) -> str:
        """Build Overpass QL query."""

# clustering.py
class ClusteringService:
    def find_golden_clusters(
        self,
        pois: List[POI],
        max_distance_km: float = 0.5
    ) -> List[GoldenCluster]:
        """Find clusters with viewpoint + coffee + parking."""

    def rank_clusters(
        self,
        clusters: List[GoldenCluster],
        user_profile: UserProfile
    ) -> List[RankedCluster]:
        """Rank clusters by user preferences."""
```

---

## 4. Database Design

### 4.1 SQLite Schema

```sql
-- Users table (optional, for future multi-user)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT,
    hiking_score REAL DEFAULT 5.0,
    foodie_score REAL DEFAULT 5.0,
    patience_score REAL DEFAULT 5.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trips table (server-side backup)
CREATE TABLE trips (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    status TEXT CHECK(status IN ('draft', 'active', 'completed')),
    data JSON NOT NULL,  -- Full trip JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- POI Cache (reduce API calls)
CREATE TABLE poi_cache (
    id INTEGER PRIMARY KEY,
    osm_id INTEGER UNIQUE,
    name TEXT,
    type TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    tags JSON,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for spatial queries
CREATE INDEX idx_poi_location ON poi_cache(lat, lon);
```

### 4.2 SQLAlchemy Models

```python
from sqlalchemy import Column, String, Float, JSON, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    hiking_score = Column(Float, default=5.0)
    foodie_score = Column(Float, default=5.0)
    patience_score = Column(Float, default=5.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Trip(Base):
    __tablename__ = "trips"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    status = Column(String, default="draft")
    data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

## 5. Key Implementation Details

### 5.1 Constraint Solver (Frontend)

```typescript
// constraintSolver.ts
interface SolverInput {
  stops: Stop[];
  startTime: Date;
  anchors: { stopId: string; time: Date }[];
}

interface SolverOutput {
  stops: StopWithTimes[];
  warnings: Warning[];
  isValid: boolean;
}

export function solveConstraints(input: SolverInput): SolverOutput {
  const { stops, startTime, anchors } = input;
  const warnings: Warning[] = [];

  // 1. Sort stops by current order
  let currentTime = startTime;
  const processedStops: StopWithTimes[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const anchor = anchors.find(a => a.stopId === stop.id);

    // Calculate arrival time
    const driveTime = i > 0
      ? getDriveTime(processedStops[i-1].coordinates, stop.coordinates)
      : 0;

    let arrival = new Date(currentTime.getTime() + driveTime * 1000);

    // Check anchor constraints
    if (anchor && arrival > anchor.time) {
      warnings.push({
        type: 'ANCHOR_VIOLATED',
        stopId: stop.id,
        message: `Cannot reach ${stop.name} by ${anchor.time}`
      });
    }

    const departure = new Date(arrival.getTime() + stop.duration_minutes * 60 * 1000);

    processedStops.push({
      ...stop,
      planned_arrival: arrival.toISOString(),
      planned_departure: departure.toISOString()
    });

    currentTime = departure;
  }

  // 2. Validate food gaps
  validateFoodGaps(processedStops, warnings);

  // 3. Validate sunset
  validateSunset(processedStops, warnings);

  return {
    stops: processedStops,
    warnings,
    isValid: warnings.filter(w => w.type === 'CRITICAL').length === 0
  };
}
```

### 5.2 WakeLock Implementation

```typescript
// useWakeLock.ts
import { useState, useEffect, useCallback } from 'react';

export function useWakeLock() {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
        setIsLocked(true);

        lock.addEventListener('release', () => {
          setIsLocked(false);
        });
      } catch (err) {
        console.error('WakeLock failed:', err);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
      setIsLocked(false);
    }
  }, [wakeLock]);

  // Re-acquire on visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && !isLocked) {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLocked, requestWakeLock]);

  return { isLocked, requestWakeLock, releaseWakeLock };
}
```

### 5.3 Deep Linking Service

```typescript
// navigation.ts
type NavApp = 'waze' | 'google' | 'apple';

interface NavigationOptions {
  lat: number;
  lon: number;
  app: NavApp;
}

export function getNavigationUrl(options: NavigationOptions): string {
  const { lat, lon, app } = options;

  switch (app) {
    case 'waze':
      return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
    case 'apple':
      return `http://maps.apple.com/?daddr=${lat},${lon}`;
    default:
      return getNavigationUrl({ lat, lon, app: 'google' });
  }
}

export function openNavigation(options: NavigationOptions): void {
  const url = getNavigationUrl(options);
  window.open(url, '_blank');
}
```

### 5.4 Off-Route Detection

```typescript
// useOffRoute.ts
import * as turf from '@turf/turf';
import { useCallback, useRef } from 'react';

interface OffRouteResult {
  isOffRoute: boolean;
  distanceKm: number;
}

export function useOffRoute(routeCoords: [number, number][]) {
  const consecutiveCount = useRef(0);
  const THRESHOLD_KM = 0.5;
  const CONSECUTIVE_REQUIRED = 3;

  const checkPosition = useCallback((
    userLat: number,
    userLon: number
  ): OffRouteResult => {
    if (!routeCoords || routeCoords.length < 2) {
      return { isOffRoute: false, distanceKm: 0 };
    }

    const point = turf.point([userLon, userLat]);
    const line = turf.lineString(routeCoords);
    const distance = turf.pointToLineDistance(point, line, { units: 'kilometers' });

    if (distance > THRESHOLD_KM) {
      consecutiveCount.current++;
    } else {
      consecutiveCount.current = 0;
    }

    return {
      isOffRoute: consecutiveCount.current >= CONSECUTIVE_REQUIRED,
      distanceKm: distance
    };
  }, [routeCoords]);

  return { checkPosition };
}
```

---

## 6. Testing Strategy

### 6.1 Backend Tests

```python
# tests/test_osrm.py
import pytest
from app.services.osrm import OSRMService

@pytest.mark.asyncio
async def test_get_route_success():
    service = OSRMService()
    result = await service.get_route(
        start=(32.08, 34.78),  # Tel Aviv
        end=(32.8, 35.5)       # Haifa
    )
    assert result.duration_seconds > 0
    assert len(result.polyline) > 10

@pytest.mark.asyncio
async def test_get_route_invalid_coords():
    service = OSRMService()
    with pytest.raises(ValueError):
        await service.get_route(
            start=(999, 999),
            end=(32.8, 35.5)
        )

# tests/test_overpass.py
@pytest.mark.asyncio
async def test_query_viewpoints():
    service = OverpassService()
    pois = await service.query_pois(
        lat=32.8,
        lon=35.5,
        radius=5000,
        poi_types=["viewpoint"]
    )
    assert isinstance(pois, list)
```

### 6.2 Frontend Tests

```typescript
// Timeline.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Timeline } from './Timeline';

const mockStops = [
  { id: '1', name: 'Stop 1', planned_arrival: '2024-01-01T09:00:00Z' },
  { id: '2', name: 'Stop 2', planned_arrival: '2024-01-01T11:00:00Z' },
];

test('renders all stops', () => {
  render(<Timeline stops={mockStops} />);
  expect(screen.getByText('Stop 1')).toBeInTheDocument();
  expect(screen.getByText('Stop 2')).toBeInTheDocument();
});

test('calls onReorder when drag completes', async () => {
  const onReorder = jest.fn();
  render(<Timeline stops={mockStops} onReorder={onReorder} />);
  // Simulate drag...
  expect(onReorder).toHaveBeenCalled();
});

// constraintSolver.test.ts
import { solveConstraints } from './constraintSolver';

test('calculates arrival times correctly', () => {
  const result = solveConstraints({
    stops: mockStops,
    startTime: new Date('2024-01-01T08:00:00Z'),
    anchors: []
  });
  expect(result.stops[0].planned_arrival).toBeDefined();
  expect(result.isValid).toBe(true);
});

test('warns on anchor violation', () => {
  const result = solveConstraints({
    stops: mockStops,
    startTime: new Date('2024-01-01T08:00:00Z'),
    anchors: [{ stopId: '1', time: new Date('2024-01-01T07:00:00Z') }]
  });
  expect(result.warnings.length).toBeGreaterThan(0);
});
```

---

## 7. Deployment Strategy

### 7.1 Frontend (Vercel)
- Build: `npm run build`
- Output: `dist/`
- Environment: Production HTTPS (required for Geolocation)

### 7.2 Backend (Render / Railway)
- Build: Docker container
- Environment variables via platform secrets
- SQLite file persisted in volume

### 7.3 Environment Variables

```env
# Backend .env
CORS_ORIGINS=https://vistatrek.vercel.app
LLM_API_KEY=your_gemini_or_openai_key
DATABASE_URL=sqlite:///./vistatrek.db

# Frontend .env
VITE_API_URL=https://api.vistatrek.com
```

---

## 8. Development Phases

### Phase 1: Backend Foundation (Week 1)
- [ ] FastAPI project setup
- [ ] OSRM service implementation
- [ ] Overpass service implementation
- [ ] Basic `/plan-trip` endpoint
- [ ] Unit tests for services

### Phase 2: Frontend Foundation (Week 1-2)
- [ ] Vite + React + TypeScript setup
- [ ] Leaflet map integration
- [ ] Basic routing (React Router)
- [ ] API client setup
- [ ] Display route on map

### Phase 3: Core Planner (Week 2-3)
- [ ] Timeline component with drag-drop
- [ ] Constraint solver implementation
- [ ] Stop cards with actions
- [ ] Ghost pins (suggestions)
- [ ] Integration tests

### Phase 4: Pilot Mode (Week 3-4)
- [ ] WakeLock implementation
- [ ] GPS tracking hook
- [ ] Off-route detection
- [ ] Pacing engine
- [ ] Deep linking to Waze/Google

### Phase 5: Polish & Chat (Week 4-5)
- [ ] Settings page
- [ ] User profile management
- [ ] Chat overlay component
- [ ] LLM integration for chat
- [ ] E2E testing
- [ ] Performance optimization

---

*Document Version: 1.0*
*Last Updated: 2026-01-18*
