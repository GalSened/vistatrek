/**
 * ChatOverlay Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatOverlay } from './ChatOverlay';
import { TripProvider } from '../../context/TripContext';
import { UserProvider } from '../../context/UserContext';
import { chatApi } from '../../api/client';
import { ChatActionResponse } from '../../types';

// Mock the API client
vi.mock('../../api/client', () => ({
  chatApi: {
    sendMessage: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public message: string
    ) {
      super(message);
    }
  },
}));

// Wrapper component with providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <TripProvider>{children}</TripProvider>
    </UserProvider>
  );
}

describe('ChatOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toggle behavior', () => {
    it('should render closed by default', () => {
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      expect(screen.getByLabelText('Open chat assistant')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should open chat panel when clicking toggle', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Trip Assistant')).toBeInTheDocument();
    });

    it('should close chat panel when clicking close button', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      // Open chat
      await user.click(screen.getByLabelText('Open chat assistant'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Close chat
      await user.click(screen.getByLabelText('Close chat'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('initial state', () => {
    it('should show empty state with example prompts', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      expect(
        screen.getByText('Hi! I can help you modify your trip.')
      ).toBeInTheDocument();
      expect(screen.getByText('"Add a coffee stop"')).toBeInTheDocument();
    });
  });

  describe('message input', () => {
    it('should have input field with placeholder', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText('Type a message...');
      expect(input).toBeInTheDocument();
    });

    it('should show character count', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('should update character count as user types', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Hello');

      expect(screen.getByText('495')).toBeInTheDocument();
    });

    it('should enforce max length of 500 characters', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText(
        'Type a message...'
      ) as HTMLInputElement;
      expect(input.maxLength).toBe(500);
    });

    it('should disable send button when input is empty', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeDisabled();
    });

    it('should enable send button when input has text', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Test message');

      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('sending messages', () => {
    it('should send message and display response', async () => {
      const mockResponse: ChatActionResponse = {
        reply: 'I understood your request.',
        action: undefined,
        updated_trip: undefined,
      };
      vi.mocked(chatApi.sendMessage).mockResolvedValue(mockResponse);

      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Add a coffee stop');
      await user.click(screen.getByLabelText('Send message'));

      // User message should appear
      expect(screen.getByText('Add a coffee stop')).toBeInTheDocument();

      // Wait for API response
      await waitFor(() => {
        expect(screen.getByText('I understood your request.')).toBeInTheDocument();
      });

      // Input should be cleared
      expect(input).toHaveValue('');
    });

    it('should display loading indicator while sending', async () => {
      // Make the API take some time
      vi.mocked(chatApi.sendMessage).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  reply: 'Done',
                  action: undefined,
                  updated_trip: undefined,
                }),
              100
            )
          )
      );

      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Test');
      await user.click(screen.getByLabelText('Send message'));

      // Loading indicator should appear
      expect(document.querySelector('.chat-typing-indicator')).toBeInTheDocument();

      // Wait for response
      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
      });
    });

    it('should display error message on API failure', async () => {
      const { ApiError } = await import('../../api/client');
      vi.mocked(chatApi.sendMessage).mockRejectedValue(
        new ApiError(503, 'Chat agent not configured')
      );

      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Test');
      await user.click(screen.getByLabelText('Send message'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Chat agent not configured'
        );
      });
    });

    it('should submit on Enter key', async () => {
      const mockResponse: ChatActionResponse = {
        reply: 'Response',
        action: undefined,
        updated_trip: undefined,
      };
      vi.mocked(chatApi.sendMessage).mockResolvedValue(mockResponse);

      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Test{Enter}');

      expect(chatApi.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Test' })
      );
    });
  });

  describe('clear history', () => {
    it('should show clear button when messages exist', async () => {
      const mockResponse: ChatActionResponse = {
        reply: 'Response',
        action: undefined,
        updated_trip: undefined,
      };
      vi.mocked(chatApi.sendMessage).mockResolvedValue(mockResponse);

      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      // Initially no clear button
      expect(
        screen.queryByLabelText('Clear chat history')
      ).not.toBeInTheDocument();

      // Send a message
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Test');
      await user.click(screen.getByLabelText('Send message'));

      await waitFor(() => {
        expect(screen.getByLabelText('Clear chat history')).toBeInTheDocument();
      });
    });

    it('should clear messages when clear button clicked', async () => {
      const mockResponse: ChatActionResponse = {
        reply: 'Response',
        action: undefined,
        updated_trip: undefined,
      };
      vi.mocked(chatApi.sendMessage).mockResolvedValue(mockResponse);

      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      // Send a message
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Test');
      await user.click(screen.getByLabelText('Send message'));

      await waitFor(() => {
        expect(screen.getByText('Test')).toBeInTheDocument();
      });

      // Clear history
      await user.click(screen.getByLabelText('Clear chat history'));

      // Messages should be gone, empty state should appear
      expect(screen.queryByText('Test')).not.toBeInTheDocument();
      expect(
        screen.getByText('Hi! I can help you modify your trip.')
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        'Chat assistant'
      );
      expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
    });

    it('should focus input when chat opens', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ChatOverlay />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Open chat assistant'));

      const input = screen.getByPlaceholderText('Type a message...');
      expect(document.activeElement).toBe(input);
    });
  });
});
