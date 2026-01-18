"""
VistaTrek Trips Router
CRUD operations for trip management
"""

import json
import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.models.database import TripModel, get_db
from app.models.schemas import (
    Coordinates,
    Route,
    Trip,
    TripCreate,
    PlanTripRequest,
    PlanTripResponse,
    TripStatus,
)

router = APIRouter()


@router.get("", response_model=list[dict])
async def list_trips(
    user_id: Optional[str] = None,
    trip_status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all trips, optionally filtered by user_id or status."""
    query = db.query(TripModel)

    if user_id:
        query = query.filter(TripModel.user_id == user_id)
    if trip_status:
        query = query.filter(TripModel.status == trip_status)

    trips = query.order_by(TripModel.updated_at.desc()).all()

    return [
        {
            "id": trip.id,
            "name": trip.name,
            "status": trip.status,
            "created_at": trip.created_at.isoformat(),
            "updated_at": trip.updated_at.isoformat(),
        }
        for trip in trips
    ]


@router.get("/{trip_id}")
async def get_trip(trip_id: str, db: Session = Depends(get_db)):
    """Get a specific trip by ID."""
    trip = db.query(TripModel).filter(TripModel.id == trip_id).first()

    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip {trip_id} not found",
        )

    trip_data = json.loads(trip.data)
    return trip_data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_trip(request: TripCreate, db: Session = Depends(get_db)):
    """Create a new trip from start/end location."""
    trip_id = str(uuid.uuid4())
    now = datetime.utcnow()

    # Create initial trip data structure
    trip_data = {
        "id": trip_id,
        "name": request.name,
        "start_location": request.start_location.model_dump(),
        "end_location": request.end_location.model_dump(),
        "date": request.date,
        "vibes": request.vibes,
        "status": TripStatus.DRAFT.value,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "route": {
            "polyline": [],
            "duration_seconds": 0,
            "distance_meters": 0,
        },
        "stops": [],
        "suggestions": None,
        "execution": None,
    }

    # Save to database
    db_trip = TripModel(
        id=trip_id,
        user_id=None,
        name=request.name,
        status=TripStatus.DRAFT.value,
        data=json.dumps(trip_data),
    )

    db.add(db_trip)
    db.commit()
    db.refresh(db_trip)

    return trip_data


@router.put("/{trip_id}")
async def update_trip(trip_id: str, trip_data: dict, db: Session = Depends(get_db)):
    """Update an existing trip."""
    db_trip = db.query(TripModel).filter(TripModel.id == trip_id).first()

    if not db_trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip {trip_id} not found",
        )

    # Update fields
    trip_data["updated_at"] = datetime.utcnow().isoformat()
    db_trip.name = trip_data.get("name", db_trip.name)
    db_trip.status = trip_data.get("status", db_trip.status)
    db_trip.data = json.dumps(trip_data)
    db_trip.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(db_trip)

    return trip_data


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(trip_id: str, db: Session = Depends(get_db)):
    """Delete a trip."""
    db_trip = db.query(TripModel).filter(TripModel.id == trip_id).first()

    if not db_trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip {trip_id} not found",
        )

    db.delete(db_trip)
    db.commit()


@router.post("/plan", response_model=PlanTripResponse)
async def plan_trip_route(request: PlanTripRequest, db: Session = Depends(get_db)):
    """
    Plan a route and discover POIs along it.
    Uses OSRM for routing and Overpass for POI discovery.
    Implements the Macro-Meso-Micro algorithm.
    """
    from app.services.trip_planner import TripPlannerService

    planner = TripPlannerService(db_session=db)
    return await planner.plan_trip(request)


@router.post("/{trip_id}/reorder")
async def reorder_stops(
    trip_id: str,
    stop_ids: list[str],
    db: Session = Depends(get_db),
):
    """
    Reorder stops and recalculate times using Constraint Solver.
    """
    from app.services.constraint_solver import ConstraintSolver

    db_trip = db.query(TripModel).filter(TripModel.id == trip_id).first()

    if not db_trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip {trip_id} not found",
        )

    trip_data = json.loads(db_trip.data)
    stops = trip_data.get("stops", [])

    # Reorder stops based on provided order
    stop_map = {stop["id"]: stop for stop in stops}
    reordered = []

    for stop_id in stop_ids:
        if stop_id not in stop_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stop {stop_id} not found in trip",
            )
        reordered.append(stop_map[stop_id])

    trip_data["stops"] = reordered

    # Run Constraint Solver to recalculate times
    solver = ConstraintSolver(trip_data)
    updated_trip_data, warnings = solver.solve()

    updated_trip_data["updated_at"] = datetime.utcnow().isoformat()
    db_trip.data = json.dumps(updated_trip_data)
    db_trip.updated_at = datetime.utcnow()

    db.commit()

    return {
        "status": "ok",
        "trip": updated_trip_data,
        "warnings": warnings,
    }


@router.post("/{trip_id}/recalculate-route")
async def recalculate_trip_route(
    trip_id: str,
    db: Session = Depends(get_db),
):
    """
    Recalculate route and times using OSRM for accurate drive times.
    """
    from app.services.routing import RoutingService
    from app.services.constraint_solver import ConstraintSolver

    db_trip = db.query(TripModel).filter(TripModel.id == trip_id).first()

    if not db_trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip {trip_id} not found",
        )

    trip_data = json.loads(db_trip.data)
    stops = trip_data.get("stops", [])

    if not stops:
        return {"status": "ok", "trip": trip_data, "warnings": []}

    # Build waypoints from stops
    start_location = trip_data.get("start_location", {})
    end_location = trip_data.get("end_location", {})

    origin = Coordinates(lat=start_location.get("lat", 0), lon=start_location.get("lon", 0))
    destination = Coordinates(lat=end_location.get("lat", 0), lon=end_location.get("lon", 0))

    waypoints = []
    for stop in stops:
        coords = stop.get("coordinates", {})
        waypoints.append(Coordinates(lat=coords.get("lat", 0), lon=coords.get("lon", 0)))

    # Get route from OSRM
    routing = RoutingService()
    route = await routing.get_route(origin, destination, waypoints=waypoints)

    if route:
        trip_data["route"] = {
            "polyline": list(route.polyline),
            "duration_seconds": route.duration_seconds,
            "distance_meters": route.distance_meters,
        }

    # Run constraint solver to recalculate stop times
    solver = ConstraintSolver(trip_data)
    updated_trip_data, warnings = solver.solve()

    updated_trip_data["updated_at"] = datetime.utcnow().isoformat()
    db_trip.data = json.dumps(updated_trip_data)
    db_trip.updated_at = datetime.utcnow()

    db.commit()

    return {
        "status": "ok",
        "trip": updated_trip_data,
        "warnings": warnings,
    }


@router.post("/{trip_id}/add-stop")
async def add_stop_to_trip(
    trip_id: str,
    stop_data: dict,
    position: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Add a stop to a trip at a specific position.
    Recalculates times after adding.
    """
    from app.services.constraint_solver import ConstraintSolver

    db_trip = db.query(TripModel).filter(TripModel.id == trip_id).first()

    if not db_trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip {trip_id} not found",
        )

    trip_data = json.loads(db_trip.data)
    stops = trip_data.get("stops", [])

    # Generate ID if not provided
    if "id" not in stop_data:
        import uuid
        stop_data["id"] = str(uuid.uuid4())

    # Set defaults
    stop_data.setdefault("duration_minutes", 30)
    stop_data.setdefault("is_anchor", False)
    stop_data.setdefault("skipped", False)

    # Insert at position or append
    if position is not None and 0 <= position <= len(stops):
        stops.insert(position, stop_data)
    else:
        stops.append(stop_data)

    trip_data["stops"] = stops

    # Recalculate times
    solver = ConstraintSolver(trip_data)
    updated_trip_data, warnings = solver.solve()

    updated_trip_data["updated_at"] = datetime.utcnow().isoformat()
    db_trip.data = json.dumps(updated_trip_data)
    db_trip.updated_at = datetime.utcnow()

    db.commit()

    return {
        "status": "ok",
        "trip": updated_trip_data,
        "stop_id": stop_data["id"],
        "warnings": warnings,
    }


@router.delete("/{trip_id}/stops/{stop_id}")
async def remove_stop_from_trip(
    trip_id: str,
    stop_id: str,
    db: Session = Depends(get_db),
):
    """
    Remove a stop from a trip and recalculate times.
    """
    from app.services.constraint_solver import ConstraintSolver

    db_trip = db.query(TripModel).filter(TripModel.id == trip_id).first()

    if not db_trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip {trip_id} not found",
        )

    trip_data = json.loads(db_trip.data)
    stops = trip_data.get("stops", [])

    # Find and remove the stop
    original_length = len(stops)
    stops = [s for s in stops if s.get("id") != stop_id]

    if len(stops) == original_length:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stop {stop_id} not found in trip",
        )

    trip_data["stops"] = stops

    # Recalculate times
    solver = ConstraintSolver(trip_data)
    updated_trip_data, warnings = solver.solve()

    updated_trip_data["updated_at"] = datetime.utcnow().isoformat()
    db_trip.data = json.dumps(updated_trip_data)
    db_trip.updated_at = datetime.utcnow()

    db.commit()

    return {
        "status": "ok",
        "trip": updated_trip_data,
        "warnings": warnings,
    }
