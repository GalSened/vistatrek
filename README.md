# VistaTrek

Discover hidden gems along your route - a road trip planning app that finds scenic viewpoints, hiking trails, local eateries, and unique stops along your journey.

## Features

- **AI-Powered Trip Planning**: Conversational interface to plan trips step-by-step with an AI assistant
- **Smart Route Planning**: Automatic discovery of interesting stops along your route
- **Golden Triangle Clusters**: POI suggestions combining viewpoints, parking, and comfort spots
- **Real-time Navigation**: Integrated pilot mode with GPS tracking, pacing engine, and auto-arrival detection
- **Personalized Experience**: Customizable preferences for hiking, food, and adventure levels
- **Multiple Nav Apps**: Support for Waze, Google Maps, and Apple Maps deep linking
- **Bilingual Support**: Full Hebrew and English localization

## Project Structure

```
vistatrek/
├── frontend/          # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Route pages (Home, Planner, Pilot, ChatPlanner)
│   │   ├── context/      # React contexts (User, Trip, Conversation)
│   │   ├── hooks/        # Custom hooks
│   │   ├── api/          # API client
│   │   ├── i18n/         # Internationalization (en, he)
│   │   └── utils/        # Utilities
│   └── ...
├── api/               # Vercel Serverless Functions (FastAPI)
│   └── index.py       # All API endpoints
└── docs/              # Documentation
```

## API Endpoints

### Trip Planning
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/trips` | POST | Create a new trip with route planning |
| `/api/trips/{id}` | GET | Get trip by ID |
| `/api/trips/{id}` | PUT | Update trip |
| `/api/trips/{id}` | DELETE | Delete trip |

### Chat Planning (AI-Powered)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/plan` | POST | Send message in planning conversation |
| `/api/chat/plan/{id}` | GET | Get conversation state |
| `/api/chat/plan/{id}/stop-decision` | POST | Approve/reject proposed stop |
| `/api/chat/debug` | GET | Debug chat configuration |

### Route Actions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/action` | POST | Process chat action on existing trip |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Vercel CLI (for deployment)

### Frontend (Local Development)

```bash
cd frontend
npm install
npm run dev
```

### API (Vercel Serverless)

The API runs as Vercel Serverless Functions. For local development:

```bash
vercel dev
```

### Environment Variables

Set these in Vercel dashboard or `.env.local`:

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key for LLM (llama-3.3-70b-versatile) |
| `LLM_MODEL` | Optional: Override default model |

## Tech Stack

**Frontend:**
- React 18
- TypeScript
- Vite
- Leaflet (maps)
- React Router
- i18next (internationalization)

**Backend (Vercel Serverless):**
- FastAPI
- Python 3.11+
- Groq LLM API (llama-3.3-70b-versatile)
- OSRM (routing)
- Overpass API (POI discovery)
- Nominatim (geocoding)

## Deployment

Deployed on Vercel at: https://vistatrek.vercel.app

```bash
vercel --prod
```

## Testing

```bash
# Frontend tests
cd frontend
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## License

MIT
