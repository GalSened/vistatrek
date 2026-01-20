"""
VistaTrek - Multilingual Geocoding Service
Supports Hebrew and English location search using Nominatim
"""

import re
import logging
from typing import Optional
import httpx

from ..config import get_settings
from ..models.schemas import LocationEntity, Coordinates

logger = logging.getLogger(__name__)

# Hebrew location aliases - common Hebrew names to canonical names
HEBREW_ALIASES: dict[str, str] = {
    # Countries
    "מונטנגרו": "Montenegro",
    "קרואטיה": "Croatia",
    "סלובניה": "Slovenia",
    "יוון": "Greece",
    "טורקיה": "Turkey",
    "איטליה": "Italy",
    "צרפת": "France",
    "ספרד": "Spain",
    "פורטוגל": "Portugal",
    "גרמניה": "Germany",
    "אוסטריה": "Austria",
    "שוויץ": "Switzerland",
    "הולנד": "Netherlands",
    "בלגיה": "Belgium",
    "צ'כיה": "Czech Republic",
    "פולין": "Poland",
    "הונגריה": "Hungary",
    "רומניה": "Romania",
    "בולגריה": "Bulgaria",
    "סרביה": "Serbia",
    "אלבניה": "Albania",
    "מקדוניה": "North Macedonia",
    "קפריסין": "Cyprus",
    "מלטה": "Malta",
    "איסלנד": "Iceland",
    "נורבגיה": "Norway",
    "שוודיה": "Sweden",
    "פינלנד": "Finland",
    "דנמרק": "Denmark",
    "אנגליה": "England",
    "סקוטלנד": "Scotland",
    "אירלנד": "Ireland",
    "יפן": "Japan",
    "תאילנד": "Thailand",
    "וייטנאם": "Vietnam",
    "קמבודיה": "Cambodia",
    "אינדונזיה": "Indonesia",
    "הודו": "India",
    "נפאל": "Nepal",
    "סרי לנקה": "Sri Lanka",
    "מרוקו": "Morocco",
    "ירדן": "Jordan",
    "מצרים": "Egypt",
    "ארצות הברית": "United States",
    "קנדה": "Canada",
    "מקסיקו": "Mexico",
    "קולומביה": "Colombia",
    "פרו": "Peru",
    "צ'ילה": "Chile",
    "ארגנטינה": "Argentina",
    "ברזיל": "Brazil",
    "אוסטרליה": "Australia",
    "ניו זילנד": "New Zealand",

    # Israeli Regions
    "גליל": "Galilee, Israel",
    "גליל עליון": "Upper Galilee, Israel",
    "גליל תחתון": "Lower Galilee, Israel",
    "גולן": "Golan Heights, Israel",
    "רמת הגולן": "Golan Heights, Israel",
    "נגב": "Negev, Israel",
    "ערבה": "Arava, Israel",
    "כרמל": "Carmel, Israel",
    "שרון": "Sharon, Israel",
    "שפלה": "Shephelah, Israel",
    "יהודה": "Judea, Israel",
    "שומרון": "Samaria, Israel",
    "עמק יזרעאל": "Jezreel Valley, Israel",
    "עמק החולה": "Hula Valley, Israel",
    "בקעת הירדן": "Jordan Valley, Israel",
    "מדבר יהודה": "Judean Desert, Israel",
    "ים המלח": "Dead Sea, Israel",
    "כנרת": "Sea of Galilee, Israel",
    "אילת": "Eilat, Israel",

    # Israeli Cities
    "תל אביב": "Tel Aviv, Israel",
    "ירושלים": "Jerusalem, Israel",
    "חיפה": "Haifa, Israel",
    "באר שבע": "Beer Sheva, Israel",
    "נתניה": "Netanya, Israel",
    "אשדוד": "Ashdod, Israel",
    "אשקלון": "Ashkelon, Israel",
    "ראשון לציון": "Rishon LeZion, Israel",
    "פתח תקווה": "Petah Tikva, Israel",
    "בני ברק": "Bnei Brak, Israel",
    "הרצליה": "Herzliya, Israel",
    "רעננה": "Ra'anana, Israel",
    "כפר סבא": "Kfar Saba, Israel",
    "רמת גן": "Ramat Gan, Israel",
    "גבעתיים": "Givatayim, Israel",
    "הוד השרון": "Hod HaSharon, Israel",
    "נהריה": "Nahariya, Israel",
    "עכו": "Acre, Israel",
    "צפת": "Safed, Israel",
    "טבריה": "Tiberias, Israel",
    "עפולה": "Afula, Israel",
    "קרית שמונה": "Kiryat Shmona, Israel",
    "מצפה רמון": "Mitzpe Ramon, Israel",
    "ערד": "Arad, Israel",
    "דימונה": "Dimona, Israel",

    # Popular destinations in Montenegro
    "קוטור": "Kotor, Montenegro",
    "בודווה": "Budva, Montenegro",
    "הרצג נובי": "Herceg Novi, Montenegro",
    "פרסט": "Perast, Montenegro",
    "טיבאט": "Tivat, Montenegro",
    "פודגוריצה": "Podgorica, Montenegro",
    "דורמיטור": "Durmitor, Montenegro",
    "אגם סקאדר": "Lake Skadar, Montenegro",

    # Popular destinations in Croatia
    "דוברובניק": "Dubrovnik, Croatia",
    "ספליט": "Split, Croatia",
    "זאגרב": "Zagreb, Croatia",
    "פליטביצה": "Plitvice Lakes, Croatia",
    "זאדאר": "Zadar, Croatia",
    "פולה": "Pula, Croatia",
    "רוביני": "Rovinj, Croatia",
    "הוואר": "Hvar, Croatia",

    # Popular destinations in Greece
    "אתונה": "Athens, Greece",
    "סנטוריני": "Santorini, Greece",
    "מיקונוס": "Mykonos, Greece",
    "כרתים": "Crete, Greece",
    "רודוס": "Rhodes, Greece",
    "קורפו": "Corfu, Greece",
    "סלוניקי": "Thessaloniki, Greece",
    "מטאורה": "Meteora, Greece",
}


class GeocodingService:
    """Handles multilingual location search and geocoding"""

    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.nominatim_base_url
        self.http_client = httpx.AsyncClient(
            timeout=10.0,
            headers={"User-Agent": "VistaTrek/1.0 (trip planning app)"}
        )

    async def search(
        self,
        query: str,
        language: str = "he",
        limit: int = 5
    ) -> list[LocationEntity]:
        """
        Search for locations using Nominatim.
        Handles Hebrew input by first checking aliases, then searching directly.
        """
        # Normalize query
        query = query.strip()
        if not query:
            return []

        # Check Hebrew aliases first
        normalized_query = self._normalize_hebrew(query)

        # Search with normalized query
        results = await self._nominatim_search(normalized_query, limit)

        # If no results and query was Hebrew, try original query
        if not results and normalized_query != query:
            results = await self._nominatim_search(query, limit)

        # Convert to LocationEntity
        entities = []
        for result in results:
            entity = self._parse_nominatim_result(result, query)
            if entity:
                entities.append(entity)

        # Sort by confidence
        entities.sort(key=lambda e: e.confidence, reverse=True)

        return entities[:limit]

    async def reverse_geocode(
        self,
        lat: float,
        lon: float
    ) -> Optional[LocationEntity]:
        """Get location details from coordinates"""
        try:
            response = await self.http_client.get(
                f"{self.base_url}/reverse",
                params={
                    "format": "jsonv2",
                    "lat": lat,
                    "lon": lon,
                    "accept-language": "en,he",
                }
            )
            response.raise_for_status()
            data = response.json()

            if data and "lat" in data:
                return LocationEntity(
                    raw_text=data.get("display_name", ""),
                    normalized=data.get("name", data.get("display_name", "")),
                    coordinates=Coordinates(lat=float(data["lat"]), lon=float(data["lon"])),
                    confidence=0.9,
                    osm_id=int(data.get("osm_id", 0)) if data.get("osm_id") else None,
                    osm_type=data.get("osm_type"),
                    display_name=data.get("display_name"),
                    country=data.get("address", {}).get("country"),
                    region=data.get("address", {}).get("state"),
                )
        except Exception as e:
            logger.error(f"Reverse geocode failed: {e}")

        return None

    def _normalize_hebrew(self, query: str) -> str:
        """
        Normalize Hebrew input to English/canonical form.
        Handles exact matches and partial matches.
        """
        # Exact match
        if query in HEBREW_ALIASES:
            return HEBREW_ALIASES[query]

        # Check if query contains a known Hebrew term
        for hebrew, english in HEBREW_ALIASES.items():
            if hebrew in query:
                # Replace Hebrew term with English
                return query.replace(hebrew, english)

        # No match found, return original
        return query

    async def _nominatim_search(
        self,
        query: str,
        limit: int
    ) -> list[dict]:
        """Execute search against Nominatim API"""
        try:
            response = await self.http_client.get(
                f"{self.base_url}/search",
                params={
                    "q": query,
                    "format": "jsonv2",
                    "limit": limit,
                    "addressdetails": 1,
                    "accept-language": "en,he",
                }
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Nominatim search failed for '{query}': {e}")
            return []

    def _parse_nominatim_result(
        self,
        result: dict,
        original_query: str
    ) -> Optional[LocationEntity]:
        """Parse Nominatim result into LocationEntity"""
        try:
            lat = float(result.get("lat", 0))
            lon = float(result.get("lon", 0))

            if lat == 0 and lon == 0:
                return None

            # Calculate confidence based on importance and match quality
            importance = float(result.get("importance", 0.5))
            place_rank = int(result.get("place_rank", 30))

            # Higher importance and lower rank = higher confidence
            confidence = min(1.0, importance + (1 - place_rank / 30) * 0.3)

            address = result.get("address", {})

            return LocationEntity(
                raw_text=original_query,
                normalized=result.get("name", result.get("display_name", "")),
                coordinates=Coordinates(lat=lat, lon=lon),
                confidence=confidence,
                osm_id=int(result.get("osm_id", 0)) if result.get("osm_id") else None,
                osm_type=result.get("osm_type"),
                display_name=result.get("display_name"),
                country=address.get("country"),
                region=address.get("state") or address.get("region"),
            )
        except Exception as e:
            logger.error(f"Failed to parse Nominatim result: {e}")
            return None

    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()


# Singleton instance
_geocoding_service: Optional[GeocodingService] = None


def get_geocoding_service() -> GeocodingService:
    """Get or create geocoding service instance"""
    global _geocoding_service
    if _geocoding_service is None:
        _geocoding_service = GeocodingService()
    return _geocoding_service
