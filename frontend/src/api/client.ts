/**
 * VistaTrek API Client
 * Handles all backend communication
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  Trip,
  PlanTripRequest,
  PlanTripResponse,
  SearchPOIsRequest,
  SearchPOIsResponse,
  ChatActionRequest,
  ChatActionResponse,
} from '../types';
import {
  ChatPlanRequest,
  ChatPlanResponse,
  StopDecisionRequest,
  StopDecisionResponse,
  ConversationState,
} from '../types/conversation';

// =============================================================================
// Configuration
// =============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// =============================================================================
// Client Instance
// =============================================================================

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// =============================================================================
// Error Handling
// =============================================================================

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function handleError(error: AxiosError): never {
  if (error.response) {
    const data = error.response.data as Record<string, string>;
    throw new ApiError(
      error.response.status,
      data?.detail || data?.message || 'Request failed',
      data?.code
    );
  } else if (error.request) {
    throw new ApiError(0, 'Network error - please check your connection');
  } else {
    throw new ApiError(0, error.message || 'Unknown error');
  }
}

// =============================================================================
// Trip API
// =============================================================================

export const tripApi = {
  /**
   * Get all trips
   */
  async list(userId?: string, status?: string): Promise<Trip[]> {
    try {
      const params = new URLSearchParams();
      if (userId) params.append('user_id', userId);
      if (status) params.append('trip_status', status);

      const response = await client.get(`/trips?${params.toString()}`);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Get a specific trip
   */
  async get(tripId: string): Promise<Trip> {
    try {
      const response = await client.get(`/trips/${tripId}`);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Create a new trip
   */
  async create(data: {
    name: string;
    start_location: { lat: number; lon: number };
    end_location: { lat: number; lon: number };
    date: string;
    vibes?: string[];
  }): Promise<Trip> {
    try {
      const response = await client.post('/trips', data);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Update a trip
   */
  async update(tripId: string, data: Partial<Trip>): Promise<Trip> {
    try {
      const response = await client.put(`/trips/${tripId}`, data);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Delete a trip
   */
  async delete(tripId: string): Promise<void> {
    try {
      await client.delete(`/trips/${tripId}`);
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Plan a trip route with POIs
   */
  async plan(request: PlanTripRequest): Promise<PlanTripResponse> {
    try {
      const response = await client.post('/trips/plan', request);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Reorder stops and recalculate times
   */
  async reorderStops(
    tripId: string,
    stopIds: string[]
  ): Promise<{ status: string; trip: Trip }> {
    try {
      const response = await client.post(`/trips/${tripId}/reorder`, stopIds);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },
};

// =============================================================================
// POI API
// =============================================================================

export const poiApi = {
  /**
   * Search for POIs near a location
   */
  async searchNear(request: SearchPOIsRequest): Promise<SearchPOIsResponse> {
    try {
      const response = await client.post('/pois/search', request);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Get cached POIs along a route
   */
  async alongRoute(
    routeCoords: [number, number][],
    buffer: number = 1000
  ): Promise<SearchPOIsResponse> {
    try {
      const response = await client.post('/pois/along-route', {
        route: routeCoords,
        buffer_meters: buffer,
      });
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },
};

// =============================================================================
// Chat API
// =============================================================================

export const chatApi = {
  /**
   * Send a chat message and get an action response
   */
  async sendMessage(request: ChatActionRequest): Promise<ChatActionResponse> {
    try {
      const response = await client.post('/chat/action', request);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },
};

// =============================================================================
// Chat Plan API (Conversational Planning)
// =============================================================================

export const chatPlanApi = {
  /**
   * Send a message in a planning conversation
   * Omit conversationId to start a new conversation
   */
  async sendMessage(request: ChatPlanRequest): Promise<ChatPlanResponse> {
    try {
      const response = await client.post('/chat/plan', request);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Handle user's decision on a proposed stop
   */
  async handleStopDecision(request: StopDecisionRequest): Promise<StopDecisionResponse> {
    try {
      const response = await client.post(
        `/chat/plan/${request.conversationId}/stop-decision`,
        request
      );
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Get the current state of a planning conversation
   */
  async getConversation(conversationId: string): Promise<ConversationState> {
    try {
      const response = await client.get(`/chat/plan/${conversationId}`);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },

  /**
   * Stream a planning response using Server-Sent Events
   * Returns an EventSource that can be used to receive streaming chunks
   */
  streamMessage(
    conversationId: string,
    message: string,
    language: string = 'he',
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ): EventSource {
    const params = new URLSearchParams({
      message,
      language,
    });
    const url = `${API_BASE_URL}/chat/plan/${conversationId}/stream?${params.toString()}`;

    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close();
        onDone();
      } else {
        onChunk(event.data);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      onError(new Error('Stream connection failed'));
    };

    return eventSource;
  },
};

// =============================================================================
// Health Check
// =============================================================================

export const healthApi = {
  /**
   * Check if the API is available
   */
  async check(): Promise<{ status: string }> {
    try {
      const response = await client.get('/health');
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
    }
  },
};

export default {
  trips: tripApi,
  pois: poiApi,
  chat: chatApi,
  chatPlan: chatPlanApi,
  health: healthApi,
};
