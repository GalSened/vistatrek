/**
 * API Client Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { tripApi, poiApi, chatApi, healthApi } from './client';

// Mock axios
vi.mock('axios', () => {
  const mockAxios: Record<string, unknown> = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  mockAxios.create = vi.fn(() => mockAxios);
  return { default: mockAxios };
});

describe('API Client', () => {
  const mockedAxios = axios as unknown as {
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tripApi', () => {
    describe('list', () => {
      it('makes GET request to /trips', async () => {
        const mockResponse = {
          data: [{ id: 'trip-1', name: 'Test Trip' }],
        };
        mockedAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await tripApi.list();

        expect(mockedAxios.get).toHaveBeenCalledWith('/trips?');
        expect(result[0].id).toBe('trip-1');
      });

      it('includes query params when provided', async () => {
        const mockResponse = { data: [] };
        mockedAxios.get.mockResolvedValueOnce(mockResponse);

        await tripApi.list('user-1', 'active');

        expect(mockedAxios.get).toHaveBeenCalledWith(
          '/trips?user_id=user-1&trip_status=active'
        );
      });
    });

    describe('get', () => {
      it('makes GET request to /trips/:id', async () => {
        const mockResponse = {
          data: {
            id: 'trip-1',
            name: 'Test Trip',
          },
        };
        mockedAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await tripApi.get('trip-1');

        expect(mockedAxios.get).toHaveBeenCalledWith('/trips/trip-1');
        expect(result.id).toBe('trip-1');
      });
    });

    describe('create', () => {
      it('makes POST request to /trips', async () => {
        const mockResponse = {
          data: { id: 'trip-1', name: 'New Trip' },
        };
        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        const data = {
          name: 'New Trip',
          start_location: { lat: 32.0, lon: 35.0 },
          end_location: { lat: 33.0, lon: 36.0 },
          date: '2024-01-15',
          vibes: ['nature'],
        };

        const result = await tripApi.create(data);

        expect(mockedAxios.post).toHaveBeenCalledWith('/trips', data);
        expect(result.id).toBe('trip-1');
      });
    });

    describe('update', () => {
      it('makes PUT request to /trips/:id', async () => {
        const mockResponse = {
          data: { id: 'trip-1', name: 'Updated Trip' },
        };
        mockedAxios.put.mockResolvedValueOnce(mockResponse);

        const result = await tripApi.update('trip-1', { name: 'Updated Trip' });

        expect(mockedAxios.put).toHaveBeenCalledWith('/trips/trip-1', {
          name: 'Updated Trip',
        });
        expect(result.name).toBe('Updated Trip');
      });
    });

    describe('delete', () => {
      it('makes DELETE request to /trips/:id', async () => {
        mockedAxios.delete.mockResolvedValueOnce({});

        await tripApi.delete('trip-1');

        expect(mockedAxios.delete).toHaveBeenCalledWith('/trips/trip-1');
      });
    });

    describe('plan', () => {
      it('makes POST request to /trips/plan', async () => {
        const mockResponse = {
          data: {
            macro_route: {
              polyline: [[35.0, 32.0]],
              duration_seconds: 3600,
              distance_meters: 50000,
            },
            suggested_stops: [],
          },
        };
        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        const request = {
          start_lat: 32.0,
          start_lon: 35.0,
          end_lat: 33.0,
          end_lon: 36.0,
          date: '2024-01-15',
          vibes: ['nature'],
        };

        const result = await tripApi.plan(request);

        expect(mockedAxios.post).toHaveBeenCalledWith('/trips/plan', request);
        expect(result.macro_route).toBeDefined();
      });
    });

    describe('reorderStops', () => {
      it('makes POST request to /trips/:id/reorder', async () => {
        const mockResponse = {
          data: {
            status: 'success',
            trip: { id: 'trip-1', stops: [] },
          },
        };
        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        const result = await tripApi.reorderStops('trip-1', ['stop-2', 'stop-1']);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          '/trips/trip-1/reorder',
          ['stop-2', 'stop-1']
        );
        expect(result.status).toBe('success');
      });
    });
  });

  describe('poiApi', () => {
    describe('searchNear', () => {
      it('makes POST request to /pois/search', async () => {
        const mockResponse = {
          data: {
            pois: [{ id: 'poi-1', name: 'Test POI' }],
          },
        };
        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        const result = await poiApi.searchNear({
          lat: 32.0,
          lon: 35.0,
          radius: 1000,
          types: ['viewpoint'],
        });

        expect(mockedAxios.post).toHaveBeenCalledWith('/pois/search', {
          lat: 32.0,
          lon: 35.0,
          radius: 1000,
          types: ['viewpoint'],
        });
        expect(result.pois[0].id).toBe('poi-1');
      });
    });

    describe('alongRoute', () => {
      it('makes POST request to /pois/along-route', async () => {
        const mockResponse = {
          data: {
            pois: [],
          },
        };
        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        const routeCoords: [number, number][] = [
          [35.0, 32.0],
          [35.5, 32.5],
        ];

        await poiApi.alongRoute(routeCoords, 500);

        expect(mockedAxios.post).toHaveBeenCalledWith('/pois/along-route', {
          route: routeCoords,
          buffer_meters: 500,
        });
      });

      it('uses default buffer when not provided', async () => {
        const mockResponse = { data: { pois: [] } };
        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        await poiApi.alongRoute([[35.0, 32.0]]);

        expect(mockedAxios.post).toHaveBeenCalledWith('/pois/along-route', {
          route: [[35.0, 32.0]],
          buffer_meters: 1000,
        });
      });
    });
  });

  describe('chatApi', () => {
    describe('sendMessage', () => {
      it('makes POST request to /chat/action', async () => {
        const mockResponse = {
          data: {
            reply: 'Sure, I can help with that!',
            action: {
              type: 'none',
            },
          },
        };
        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        const request = {
          text: 'Find a coffee shop near me',
          current_trip_id: 'trip-1',
          user_location: { lat: 32.0, lon: 35.0 },
        };

        const result = await chatApi.sendMessage(request);

        expect(mockedAxios.post).toHaveBeenCalledWith('/chat/action', request);
        expect(result.reply).toBe('Sure, I can help with that!');
      });

      it('works without optional parameters', async () => {
        const mockResponse = {
          data: {
            reply: 'Hello!',
          },
        };
        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        const request = {
          text: 'Hello',
        };

        const result = await chatApi.sendMessage(request);

        expect(mockedAxios.post).toHaveBeenCalledWith('/chat/action', request);
        expect(result.reply).toBe('Hello!');
      });
    });
  });

  describe('healthApi', () => {
    describe('check', () => {
      it('makes GET request to /health', async () => {
        const mockResponse = {
          data: { status: 'healthy' },
        };
        mockedAxios.get.mockResolvedValueOnce(mockResponse);

        const result = await healthApi.check();

        expect(mockedAxios.get).toHaveBeenCalledWith('/health');
        expect(result.status).toBe('healthy');
      });
    });
  });
});
