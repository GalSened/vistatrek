"""Validation agent for ensuring data accuracy."""

import logging
from typing import Dict, Any, List

from .state import TripReportState
from .research import haversine_distance

logger = logging.getLogger(__name__)

# Invalid or generic names to reject
INVALID_NAMES = {"unnamed", "unknown", "", "null", "none", "untitled"}


def validation_agent(state: TripReportState) -> Dict[str, Any]:
    """
    Validation agent: Verify data accuracy with 100% accuracy requirement.

    This agent validates:
    1. Location was verified via geocoding
    2. Coordinates are within valid bounds
    3. Name is valid and not generic
    4. Confidence meets threshold
    5. No duplicate locations
    """
    errors = []
    validated = []

    enriched_stops = state.get("enriched_stops", [])
    logger.info(f"Validating {len(enriched_stops)} stops")

    for stop in enriched_stops:
        stop_errors = []
        stop_name = stop.get("name", "Unknown")

        # Check 1: Location was verified
        if not stop.get("verified"):
            stop_errors.append(f"Location not verified: {stop_name}")

        # Check 2: Coordinates within valid bounds
        coords = stop.get("coordinates", {})
        lat = coords.get("lat")
        lon = coords.get("lon")

        if lat is None or lon is None:
            stop_errors.append(f"Missing coordinates: {stop_name}")
        else:
            if not (-90 <= lat <= 90):
                stop_errors.append(f"Invalid latitude ({lat}): {stop_name}")
            if not (-180 <= lon <= 180):
                stop_errors.append(f"Invalid longitude ({lon}): {stop_name}")

        # Check 3: Name is valid and not generic
        name = stop.get("name", "")
        if not name:
            stop_errors.append(f"Missing name")
        elif name.lower().strip() in INVALID_NAMES:
            stop_errors.append(f"Invalid name: {name}")

        # Check 4: Confidence threshold (0.7 minimum)
        confidence = stop.get("confidence", 0)
        if confidence < 0.7:
            stop_errors.append(f"Low confidence ({confidence:.2f}): {stop_name}")

        # Check 5: No duplicates (within 100m of existing validated stops)
        if coords and lat is not None and lon is not None:
            for validated_stop in validated:
                validated_coords = validated_stop.get("coordinates", {})
                if validated_coords:
                    distance = haversine_distance(coords, validated_coords)
                    if distance < 0.1:  # 100 meters
                        stop_errors.append(f"Duplicate of {validated_stop.get('name')}: {stop_name}")
                        break

        # Add to validated list if no errors
        if stop_errors:
            errors.extend(stop_errors)
            logger.debug(f"Stop failed validation: {stop_name} - {stop_errors}")
        else:
            validated.append(stop)
            logger.debug(f"Stop passed validation: {stop_name}")

    # Determine overall status
    total_stops = len(enriched_stops)
    valid_count = len(validated)

    if total_stops == 0:
        status = "invalid"
    elif valid_count == total_stops:
        status = "valid"
    elif valid_count >= total_stops * 0.8:
        status = "partial"  # 80%+ valid is acceptable
    else:
        status = "invalid"

    logger.info(
        f"Validation complete: {valid_count}/{total_stops} stops valid, "
        f"status={status}, {len(errors)} errors"
    )

    return {
        "validation_status": status,
        "validation_errors": errors,
        "validated_stops": validated,
    }
