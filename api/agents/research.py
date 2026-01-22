"""Research agent for gathering and enriching POI data."""

import logging
import requests
from typing import Dict, Any, List, Optional
from math import radians, sin, cos, sqrt, atan2

from .state import TripReportState

logger = logging.getLogger(__name__)

# Overpass API endpoints (prioritize reliable ones)
OVERPASS_ENDPOINTS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",  # Most reliable
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",  # Often times out
]


def query_overpass_with_fallback(query: str, timeout: int = 20) -> Optional[dict]:
    """Query Overpass API with fallback to mirror servers."""
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            logger.info(f"Trying Overpass endpoint: {endpoint}")
            response = requests.post(
                endpoint,
                data={"data": query},
                timeout=timeout,
            )
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Overpass success from {endpoint}: {len(data.get('elements', []))} elements")
                return data
            else:
                logger.warning(f"Overpass {endpoint} returned {response.status_code}")
        except requests.Timeout:
            logger.warning(f"Overpass {endpoint} timed out")
        except Exception as e:
            logger.warning(f"Overpass {endpoint} error: {e}")

    logger.error("All Overpass endpoints failed")
    return None

# Mapping of user vibes to OSM tags
VIBE_TO_OSM_TAGS = {
    "nature": ["tourism=viewpoint", "natural=peak", "leisure=nature_reserve", "natural=waterfall"],
    "food": ["amenity=restaurant", "amenity=cafe", "amenity=bar", "amenity=fast_food"],
    "history": ["tourism=museum", "historic=monument", "historic=castle", "historic=ruins"],
    "adventure": ["sport=climbing", "leisure=water_park", "tourism=theme_park", "natural=cliff"],
    "art": ["tourism=gallery", "tourism=museum", "amenity=theatre", "amenity=arts_centre"],
    "chill": ["amenity=cafe", "leisure=park", "natural=beach", "tourism=picnic_site"],
    "hiking": ["tourism=viewpoint", "natural=peak", "route=hiking", "highway=path"],
    "foodie": ["amenity=restaurant", "amenity=cafe", "shop=bakery", "amenity=ice_cream"],
}


def geocode_verify(name: str, coordinates: Dict[str, float]) -> Optional[Dict[str, Any]]:
    """Verify a location exists via Nominatim reverse geocoding."""
    try:
        lat = coordinates.get("lat")
        lon = coordinates.get("lon")
        if lat is None or lon is None:
            return None

        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "lat": lat,
                "lon": lon,
                "format": "json",
                "zoom": 18,
            },
            headers={"User-Agent": "VistaTrek/1.0"},
            timeout=10,
        )

        if response.status_code == 200:
            data = response.json()
            if data and "error" not in data:
                return {
                    "verified_name": data.get("name") or data.get("display_name", "").split(",")[0],
                    "display_name": data.get("display_name"),
                    "osm_type": data.get("osm_type"),
                    "osm_id": data.get("osm_id"),
                    "address": data.get("address", {}),
                }
    except Exception as e:
        logger.error(f"Geocode verify error for {name}: {e}")
    return None


def fetch_poi_details(coordinates: Dict[str, float], radius_m: int = 50) -> Dict[str, Any]:
    """Fetch additional POI details from Overpass API."""
    try:
        lat = coordinates.get("lat")
        lon = coordinates.get("lon")
        if lat is None or lon is None:
            return {}

        # Query for POI details near the coordinates
        query = f"""
        [out:json][timeout:10];
        (
          node(around:{radius_m},{lat},{lon})["name"];
          way(around:{radius_m},{lat},{lon})["name"];
        );
        out body;
        """

        data = query_overpass_with_fallback(query, timeout=15)
        if data:
            elements = data.get("elements", [])
            if elements:
                # Get the closest element with the most tags
                best = max(elements, key=lambda e: len(e.get("tags", {})))
                tags = best.get("tags", {})
                return {
                    "opening_hours": tags.get("opening_hours"),
                    "phone": tags.get("phone"),
                    "website": tags.get("website"),
                    "wheelchair": tags.get("wheelchair"),
                    "cuisine": tags.get("cuisine"),
                    "description": tags.get("description"),
                    "osm_id": best.get("id"),
                    "osm_type": best.get("type"),
                }
    except Exception as e:
        logger.error(f"Overpass POI details error: {e}")
    return {}


def fetch_wikimedia_images(name: str, coordinates: Dict[str, float]) -> List[str]:
    """Fetch images from Wikimedia Commons near the location."""
    try:
        lat = coordinates.get("lat")
        lon = coordinates.get("lon")
        if lat is None or lon is None:
            return []

        # Use Wikimedia Commons geosearch API
        response = requests.get(
            "https://commons.wikimedia.org/w/api.php",
            params={
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat}|{lon}",
                "gsradius": 500,
                "gslimit": 5,
                "format": "json",
            },
            headers={"User-Agent": "VistaTrek/1.0"},
            timeout=10,
        )

        if response.status_code == 200:
            data = response.json()
            pages = data.get("query", {}).get("geosearch", [])
            # Return page IDs that can be converted to image URLs
            return [f"https://commons.wikimedia.org/wiki/File:{p.get('title', '').replace(' ', '_')}"
                    for p in pages[:3] if p.get("title")]
    except Exception as e:
        logger.debug(f"Wikimedia images fetch error: {e}")
    return []


def calculate_confidence(verified: Optional[Dict], details: Dict) -> float:
    """Calculate confidence score based on verification and details."""
    score = 0.0

    # Verified location adds base confidence
    if verified:
        score += 0.5
        if verified.get("osm_id"):
            score += 0.1

    # Additional details add confidence
    if details:
        if details.get("opening_hours"):
            score += 0.1
        if details.get("website"):
            score += 0.1
        if details.get("phone"):
            score += 0.05
        if details.get("osm_id"):
            score += 0.1

    return min(score, 1.0)


def haversine_distance(coord1: Dict[str, float], coord2: Dict[str, float]) -> float:
    """Calculate distance between two coordinates in km."""
    R = 6371  # Earth's radius in km

    lat1 = radians(coord1.get("lat", 0))
    lat2 = radians(coord2.get("lat", 0))
    dlat = radians(coord2.get("lat", 0) - coord1.get("lat", 0))
    dlon = radians(coord2.get("lon", 0) - coord1.get("lon", 0))

    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c


def search_pois_by_vibes(
    center: Dict[str, float],
    vibes: List[str],
    radius_km: int = 10,
    limit: int = 10,
    exclude_coords: Optional[List[Dict[str, float]]] = None,
) -> List[Dict[str, Any]]:
    """Search Overpass for POIs matching user vibes."""
    logger.info(f"search_pois_by_vibes called - center: {center}, vibes: {vibes}")
    if not vibes:
        logger.info("No vibes provided, returning empty list")
        return []

    exclude_coords = exclude_coords or []

    # Collect OSM tags for the vibes
    osm_tags = []
    vibe_map = {}  # Track which vibe each tag came from
    for vibe in vibes:
        tags = VIBE_TO_OSM_TAGS.get(vibe, [])
        for tag in tags:
            if tag not in osm_tags:
                osm_tags.append(tag)
                vibe_map[tag] = vibe

    if not osm_tags:
        return []

    lat = center.get("lat")
    lon = center.get("lon")
    if lat is None or lon is None:
        return []

    try:
        # Query POIs in smaller batches to avoid Overpass timeouts
        # Use 3km radius for reliable queries
        radius_m = min(radius_km * 1000, 3000)
        all_elements = []

        # Split tags into small batches and query each separately
        batch_size = 2
        tag_batches = [osm_tags[i:i+batch_size] for i in range(0, min(len(osm_tags), 6), batch_size)]

        for batch in tag_batches:
            tag_queries = []
            for tag in batch:
                key, value = tag.split("=")
                tag_queries.append(f'nw(around:{radius_m},{lat},{lon})["{key}"="{value}"]["name"];')

            logger.info(f"Overpass batch query: {batch}, radius: {radius_m}m")

            query = f"""
            [out:json][timeout:45];
            (
              {' '.join(tag_queries)}
            );
            out center 15;
            """

            data = query_overpass_with_fallback(query, timeout=50)
            if data:
                batch_elements = data.get("elements", [])
                logger.info(f"Batch returned {len(batch_elements)} elements")
                all_elements.extend(batch_elements)

            # Stop if we have enough POIs
            if len(all_elements) >= limit:
                break

        logger.info(f"Total Overpass elements: {len(all_elements)}")

        if not all_elements:
            logger.warning("No POIs found from Overpass")
            return []

        results = []

        for element in all_elements:
            tags = element.get("tags", {})

            # Handle both node and way elements
            # Nodes have direct lat/lon, ways have center.lat/center.lon
            if element.get("type") == "way":
                center = element.get("center", {})
                elem_lat = center.get("lat")
                elem_lon = center.get("lon")
            else:
                elem_lat = element.get("lat")
                elem_lon = element.get("lon")

            if not elem_lat or not elem_lon or not tags.get("name"):
                continue

            coords = {"lat": elem_lat, "lon": elem_lon}

            # Skip if too close to excluded coordinates
            too_close = False
            for exc in exclude_coords:
                if haversine_distance(coords, exc) < 0.1:  # 100m
                    too_close = True
                    break
            if too_close:
                continue

            # Determine which vibe this POI matches
            matched_vibe = None
            for tag, vibe in vibe_map.items():
                key, value = tag.split("=")
                if tags.get(key) == value:
                    matched_vibe = vibe
                    break

            # Determine POI type
            poi_type = (
                tags.get("tourism")
                or tags.get("amenity")
                or tags.get("natural")
                or tags.get("historic")
                or tags.get("leisure")
                or "place"
            )

            results.append({
                "name": tags.get("name"),
                "type": poi_type,
                "coordinates": coords,
                "tags": tags,
                "matched_vibe": matched_vibe,
                "osm_id": element.get("id"),
            })

        # Sort by distance from center and limit
        results.sort(key=lambda p: haversine_distance(center, p["coordinates"]))
        return results[:limit]

    except Exception as e:
        logger.error(f"Overpass vibe search error: {e}")
        return []


def research_agent(state: TripReportState) -> Dict[str, Any]:
    """
    Research agent: Enrich approved stops AND discover new POIs.

    This agent:
    1. Verifies and enriches user-approved stops with API data
    2. Discovers new POIs based on user preferences (vibes)
    """
    enriched = []
    discovered = []

    logger.info(f"Research agent starting - attempt {state.get('research_attempts', 0) + 1}")

    # PART 1: Enrich user-approved stops
    for stop in state.get("approved_stops", []):
        coords = stop.get("coordinates", {})

        # Verify location via Nominatim
        verified = geocode_verify(stop.get("name", ""), coords)

        # Get additional details from Overpass
        details = fetch_poi_details(coords)

        # Try to get images
        images = fetch_wikimedia_images(stop.get("name", ""), coords)

        enriched.append({
            **stop,
            "source": "user_approved",
            "verified": verified is not None,
            "verified_data": verified,
            "details": details,
            "images": images[:3] if images else [],
            "confidence": calculate_confidence(verified, details),
        })

    # PART 2: Discover NEW POIs based on preferences
    destination = state.get("destination", {})
    destination_coords = destination.get("coordinates", {})
    preferences = state.get("preferences", {})
    user_vibes = preferences.get("vibes", [])

    logger.info(f"POI Discovery - destination: {destination}")
    logger.info(f"POI Discovery - destination_coords: {destination_coords}")
    logger.info(f"POI Discovery - user_vibes: {user_vibes}")

    if destination_coords and user_vibes:
        # Get coordinates of already-enriched stops to exclude
        exclude_coords = [s.get("coordinates", {}) for s in enriched if s.get("coordinates")]

        new_pois = search_pois_by_vibes(
            center=destination_coords,
            vibes=user_vibes,
            radius_km=10,
            limit=10,
            exclude_coords=exclude_coords,
        )

        for poi in new_pois:
            # Verify and enrich each discovered POI
            verified = geocode_verify(poi["name"], poi["coordinates"])
            details = fetch_poi_details(poi["coordinates"])
            images = fetch_wikimedia_images(poi["name"], poi["coordinates"])

            discovered.append({
                **poi,
                "source": "ai_discovered",
                "verified": verified is not None,
                "verified_data": verified,
                "details": details,
                "images": images[:2] if images else [],
                "confidence": calculate_confidence(verified, details),
                "match_reason": f"Matches your interest in {poi.get('matched_vibe', 'travel')}",
            })

    logger.info(f"Research complete: {len(enriched)} enriched, {len(discovered)} discovered")

    return {
        "enriched_stops": enriched + discovered,
        "research_complete": True,
        "research_attempts": state.get("research_attempts", 0) + 1,
    }
