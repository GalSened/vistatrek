# VistaTrek Backend

FastAPI backend implementing the Macro-Meso-Micro algorithm for scenic route planning.

## Setup

```bash
cd /Users/galsened/vistatrek/backend
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload
```

The API will be available at http://localhost:8000

## API Endpoints

### GET /
Health check endpoint.

### POST /plan_trip
Main endpoint for route planning.

**Request:**
```json
{
  "start": {"lat": 32.0853, "lon": 34.7818},
  "end": {"lat": 33.3062, "lon": 35.7672}
}
```

**Response:**
```json
{
  "trip_summary": {
    "duration_min": 180,
    "distance_km": 215.5
  },
  "route_geometry": [[lon, lat], ...],
  "recommended_stops": [...],
  "search_area": {"lat": 32.5, "lon": 35.2}
}
```

## API Documentation

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
