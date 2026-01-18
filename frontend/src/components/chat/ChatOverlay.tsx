/**
 * ChatOverlay Component
 * Per PRD: AI-powered chat agent accessible from all screens
 *
 * Features:
 * - Floating chat bubble
 * - Expandable chat panel
 * - Natural language trip modifications
 * - 500 character limit per message
 */

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useTrip } from '../../context/TripContext';
import { chatApi, ApiError } from '../../api/client';
import { ChatMessage, ChatActionResponse, Coordinates } from '../../types';

interface ChatOverlayProps {
  /** Current user location for context */
  userLocation?: Coordinates | null;
}

const MAX_MESSAGE_LENGTH = 500;

export function ChatOverlay({ userLocation }: ChatOverlayProps) {
  const { currentTrip } = useTrip();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current?.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
    setError(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_MESSAGE_LENGTH) {
      setInputValue(value);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const response: ChatActionResponse = await chatApi.sendMessage({
        text: userMessage.content,
        current_trip_id: currentTrip?.id,
        user_location: userLocation || undefined,
      });

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // If trip was updated, we'd trigger a refresh here
      // The TripContext should handle this automatically via the updated_trip field
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : 'Failed to send message. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setError(null);
  };

  const remainingChars = MAX_MESSAGE_LENGTH - inputValue.length;

  return (
    <div className="chat-overlay">
      {/* Chat Toggle Button */}
      <button
        className={`chat-toggle ${isOpen ? 'chat-toggle--open' : ''}`}
        onClick={toggleChat}
        aria-label={isOpen ? 'Close chat' : 'Open chat assistant'}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <span className="chat-toggle__icon">×</span>
        ) : (
          <span className="chat-toggle__icon">💬</span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="chat-panel" role="dialog" aria-label="Chat assistant">
          <header className="chat-header">
            <h3>Trip Assistant</h3>
            <div className="chat-header__actions">
              {messages.length > 0 && (
                <button
                  className="chat-clear-btn"
                  onClick={clearHistory}
                  aria-label="Clear chat history"
                >
                  Clear
                </button>
              )}
            </div>
          </header>

          <div className="chat-messages" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <p>Hi! I can help you modify your trip.</p>
                <p className="chat-empty__examples">Try saying:</p>
                <ul>
                  <li>"Add a coffee stop"</li>
                  <li>"Remove the gas station"</li>
                  <li>"Move lunch to 1pm"</li>
                </ul>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat-message chat-message--${message.role}`}
                >
                  <div className="chat-message__content">{message.content}</div>
                  <time className="chat-message__time">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              ))
            )}
            {isLoading && (
              <div className="chat-message chat-message--assistant chat-message--loading">
                <div className="chat-typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="chat-error" role="alert">
              {error}
            </div>
          )}

          <form className="chat-input-form" onSubmit={handleSubmit}>
            <div className="chat-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={isLoading}
                maxLength={MAX_MESSAGE_LENGTH}
                aria-label="Chat message input"
              />
              <span
                className={`chat-char-count ${remainingChars < 50 ? 'chat-char-count--warning' : ''}`}
              >
                {remainingChars}
              </span>
            </div>
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send message"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default ChatOverlay;
