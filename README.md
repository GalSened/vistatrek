# VistaTrek

Discover hidden gems along your route - a road trip planning app that finds scenic viewpoints, hiking trails, local eateries, and unique stops along your journey.

## Features

- **Smart Route Planning**: Plan trips with automatic discovery of interesting stops along your route
- **Golden Triangle Clusters**: AI-powered stop suggestions based on your preferences
- **Real-time Navigation**: Integrated pilot mode with GPS tracking, pacing engine, and auto-arrival detection
- **Personalized Experience**: Customizable preferences for hiking, food, and adventure levels
- **Multiple Nav Apps**: Support for Waze, Google Maps, and Apple Maps deep linking

## Project Structure

```
vistatrek/
├── frontend/          # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Route pages
│   │   ├── context/      # React contexts
│   │   ├── hooks/        # Custom hooks
│   │   ├── api/          # API client
│   │   └── utils/        # Utilities
│   └── ...
├── backend/           # FastAPI + Python
│   ├── app/
│   │   ├── routers/      # API routes
│   │   ├── services/     # Business logic
│   │   └── models/       # Data models
│   └── ...
└── docs/              # Documentation
```

## Getting Started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Tech Stack

**Frontend:**
- React 18
- TypeScript
- Vite
- Mapbox GL JS
- React Router

**Backend:**
- FastAPI
- Python 3.11+
- OpenRouteService API
- Anthropic Claude API

## Testing

```bash
# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
pytest
```

## License

MIT
# Trigger rebuild Wed Jan 21 06:49:42 IST 2026
