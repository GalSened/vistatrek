"""HTML generator agent for creating polished trip reports."""

import logging
import os
import requests
from typing import Dict, Any, List
from jinja2 import Environment, BaseLoader

from .state import TripReportState

logger = logging.getLogger(__name__)

# Groq API configuration
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"


def call_groq_api(messages: List[Dict[str, str]], max_tokens: int = 300) -> str:
    """Call Groq API for text generation."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY not set, using fallback descriptions")
        return ""

    try:
        response = requests.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.7,
            },
            timeout=30,
        )

        if response.status_code == 200:
            data = response.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content", "")
        else:
            logger.error(f"Groq API error: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Groq API call failed: {e}")

    return ""


def generate_stop_description(
    name: str,
    stop_type: str,
    preferences: Dict[str, Any],
    destination: str,
    details: Dict[str, Any],
    source: str,
) -> str:
    """Generate an engaging description for a stop using LLM."""
    vibes = preferences.get("vibes", [])
    vibes_str = ", ".join(vibes) if vibes else "exploring"

    # Build context from available details
    context_parts = []
    if details.get("opening_hours"):
        context_parts.append(f"Open: {details['opening_hours']}")
    if details.get("cuisine"):
        context_parts.append(f"Cuisine: {details['cuisine']}")
    if details.get("description"):
        context_parts.append(f"Known for: {details['description']}")

    context = ". ".join(context_parts) if context_parts else ""

    prompt = f"""Write a 2-3 sentence engaging description for this travel stop. Be specific and helpful.

Name: {name}
Type: {stop_type}
Destination: {destination}
Traveler interests: {vibes_str}
{"Additional info: " + context if context else ""}

Write naturally without generic phrases like "must-visit" or "hidden gem". Focus on what makes this place interesting for someone who enjoys {vibes_str}."""

    description = call_groq_api([{"role": "user", "content": prompt}])

    if not description:
        # Fallback description
        if source == "ai_discovered":
            description = f"Discovered based on your interest in {vibes_str}. {name} is a {stop_type} worth exploring during your trip to {destination}."
        else:
            description = f"{name} is a {stop_type} in {destination} that you selected for your trip."

    return description.strip()


def generate_trip_overview(
    destination: Dict[str, Any],
    date_range: Dict[str, str],
    stops_count: int,
    preferences: Dict[str, Any],
) -> str:
    """Generate a trip overview using LLM."""
    dest_name = destination.get("display_name", "your destination")
    country = destination.get("country", "")
    vibes = preferences.get("vibes", [])
    pace = preferences.get("pace", "moderate")
    start_date = date_range.get("start", "")
    end_date = date_range.get("end", "")

    prompt = f"""Write a brief, engaging 3-4 sentence overview for a trip itinerary.

Destination: {dest_name}{f", {country}" if country else ""}
Dates: {start_date} to {end_date}
Number of stops: {stops_count}
Travel style: {pace} pace
Interests: {", ".join(vibes) if vibes else "general sightseeing"}

Be welcoming and excited about the trip. Don't use generic phrases."""

    overview = call_groq_api([{"role": "user", "content": prompt}])

    if not overview:
        # Fallback overview
        overview = f"Your trip to {dest_name} includes {stops_count} carefully selected stops. "
        if vibes:
            overview += f"Based on your interest in {', '.join(vibes)}, "
        overview += f"we've planned a {pace}-paced adventure for you."

    return overview.strip()


# HTML Template
REPORT_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trip to {{ destination.display_name }} | VistaTrek</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1a1a2e;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }

        .header .dates {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .vibes {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-top: 20px;
            flex-wrap: wrap;
        }

        .vibe-tag {
            background: rgba(255,255,255,0.2);
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 0.9rem;
            backdrop-filter: blur(10px);
        }

        .overview {
            padding: 30px 40px;
            background: #f8f9ff;
            border-bottom: 1px solid #e8e8f0;
        }

        .overview p {
            font-size: 1.1rem;
            color: #4a4a6a;
        }

        .stops {
            padding: 40px;
        }

        .stops h2 {
            font-size: 1.8rem;
            margin-bottom: 30px;
            color: #1a1a2e;
        }

        .stop-card {
            background: #f8f9ff;
            border-radius: 16px;
            padding: 25px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .stop-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.15);
        }

        .stop-card.discovered {
            border-left-color: #10b981;
        }

        .stop-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }

        .stop-name {
            font-size: 1.4rem;
            font-weight: 600;
            color: #1a1a2e;
        }

        .stop-type {
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
            text-transform: capitalize;
        }

        .stop-card.discovered .stop-type {
            background: #10b981;
        }

        .stop-description {
            color: #4a4a6a;
            margin-bottom: 15px;
        }

        .stop-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            font-size: 0.9rem;
            color: #6b7280;
        }

        .stop-meta span {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .match-reason {
            margin-top: 10px;
            padding: 10px 15px;
            background: rgba(16, 185, 129, 0.1);
            border-radius: 8px;
            font-size: 0.9rem;
            color: #059669;
        }

        .images {
            display: flex;
            gap: 10px;
            margin-top: 15px;
            overflow-x: auto;
        }

        .images a {
            color: #667eea;
            font-size: 0.85rem;
            text-decoration: none;
            white-space: nowrap;
        }

        .images a:hover {
            text-decoration: underline;
        }

        .footer {
            padding: 30px 40px;
            background: #1a1a2e;
            color: white;
            text-align: center;
        }

        .footer p {
            opacity: 0.8;
            font-size: 0.9rem;
        }

        .footer .brand {
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        @media (max-width: 600px) {
            body {
                padding: 10px;
            }

            .header {
                padding: 30px 20px;
            }

            .header h1 {
                font-size: 1.8rem;
            }

            .stops, .overview {
                padding: 20px;
            }

            .stop-header {
                flex-direction: column;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ destination.display_name }}</h1>
            <p class="dates">{{ date_range.start }} — {{ date_range.end }}</p>
            {% if preferences.vibes %}
            <div class="vibes">
                {% for vibe in preferences.vibes %}
                <span class="vibe-tag">{{ vibe }}</span>
                {% endfor %}
            </div>
            {% endif %}
        </div>

        <div class="overview">
            <p>{{ overview }}</p>
        </div>

        <div class="stops">
            <h2>Your Stops ({{ stops|length }})</h2>

            {% for stop in stops %}
            <div class="stop-card {% if stop.source == 'ai_discovered' %}discovered{% endif %}">
                <div class="stop-header">
                    <span class="stop-name">{{ stop.name }}</span>
                    <span class="stop-type">{{ stop.type or 'place' }}</span>
                </div>

                <p class="stop-description">{{ stop.ai_description }}</p>

                <div class="stop-meta">
                    {% if stop.details and stop.details.opening_hours %}
                    <span>🕐 {{ stop.details.opening_hours }}</span>
                    {% endif %}
                    {% if stop.details and stop.details.website %}
                    <span>🌐 <a href="{{ stop.details.website }}" target="_blank">Website</a></span>
                    {% endif %}
                    {% if stop.details and stop.details.phone %}
                    <span>📞 {{ stop.details.phone }}</span>
                    {% endif %}
                    {% if stop.coordinates %}
                    <span>📍 <a href="https://www.openstreetmap.org/?mlat={{ stop.coordinates.lat }}&mlon={{ stop.coordinates.lon }}&zoom=17" target="_blank">View on map</a></span>
                    {% endif %}
                </div>

                {% if stop.match_reason %}
                <div class="match-reason">✨ {{ stop.match_reason }}</div>
                {% endif %}

                {% if stop.images %}
                <div class="images">
                    {% for img in stop.images %}
                    <a href="{{ img }}" target="_blank">📷 Photo {{ loop.index }}</a>
                    {% endfor %}
                </div>
                {% endif %}
            </div>
            {% endfor %}
        </div>

        <div class="footer">
            <p class="brand">VistaTrek</p>
            <p>Generated with AI-powered trip planning</p>
        </div>
    </div>
</body>
</html>"""


def render_report_template(
    destination: Dict[str, Any],
    date_range: Dict[str, str],
    preferences: Dict[str, Any],
    overview: str,
    stops: List[Dict[str, Any]],
) -> str:
    """Render HTML report using Jinja2 template."""
    env = Environment(loader=BaseLoader())
    template = env.from_string(REPORT_TEMPLATE)

    return template.render(
        destination=destination,
        date_range=date_range,
        preferences=preferences,
        overview=overview,
        stops=stops,
    )


def html_generator_agent(state: TripReportState) -> Dict[str, Any]:
    """
    HTML Generator Agent: Create polished report with AI-enhanced descriptions.

    This agent:
    1. Generates AI descriptions for each validated stop
    2. Creates a trip overview
    3. Renders the final HTML report
    """
    logger.info(f"HTML generator starting with {len(state.get('validated_stops', []))} validated stops")

    validated_stops = state.get("validated_stops", [])
    destination = state.get("destination", {})
    date_range = state.get("date_range", {})
    preferences = state.get("preferences", {})

    if not validated_stops:
        logger.warning("No validated stops to generate report - generating fallback report")
        # Generate a fallback report with just the trip overview
        trip_overview = generate_trip_overview(
            destination=destination,
            date_range=date_range,
            stops_count=0,
            preferences=preferences,
        )

        fallback_html = render_report_template(
            destination=destination,
            date_range=date_range,
            preferences=preferences,
            overview=trip_overview + " We're still discovering places for you - check back soon!",
            stops=[],
        )

        return {
            "html_report": fallback_html,
            "generation_status": "complete",
        }

    # Generate AI descriptions for each stop
    stops_with_descriptions = []
    for stop in validated_stops:
        description = generate_stop_description(
            name=stop.get("name", "Unknown"),
            stop_type=stop.get("type", "place"),
            preferences=preferences,
            destination=destination.get("display_name", ""),
            details=stop.get("details", {}),
            source=stop.get("source", "user_approved"),
        )

        stops_with_descriptions.append({
            **stop,
            "ai_description": description,
        })

    # Generate trip overview
    trip_overview = generate_trip_overview(
        destination=destination,
        date_range=date_range,
        stops_count=len(stops_with_descriptions),
        preferences=preferences,
    )

    # Render HTML
    html_report = render_report_template(
        destination=destination,
        date_range=date_range,
        preferences=preferences,
        overview=trip_overview,
        stops=stops_with_descriptions,
    )

    logger.info(f"HTML report generated: {len(html_report)} bytes")

    return {
        "html_report": html_report,
        "generation_status": "complete",
    }
