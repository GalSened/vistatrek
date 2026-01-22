/**
 * Chat Planner Page
 * Conversational AI-powered trip planning interface
 */

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversation } from '../context/ConversationContext';
import ProposedStopCard from '../components/chat/ProposedStopCard';
import QuickReplyButtons from '../components/chat/QuickReplyButtons';
import { getPhaseLabel } from '../types/conversation';

export default function ChatPlanner() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  const {
    conversationId,
    phase,
    messages,
    currentProposal,
    isLoading,
    error,
    reportUrl,
    isGeneratingReport,
    startConversation,
    sendMessage,
    approveStop,
    rejectStop,
    modifyStop,
    resetConversation,
    generateReport,
  } = useConversation();

  const language = i18n.language === 'he' ? 'he' : 'en';
  const isRTL = language === 'he';

  // Start conversation on mount
  useEffect(() => {
    if (!conversationId) {
      startConversation(language);
    }
  }, [conversationId, language, startConversation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input after loading
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleQuickReply = (value: string) => {
    if (value === 'approve' && currentProposal) {
      approveStop(currentProposal.id);
    } else if (value === 'reject' && currentProposal) {
      rejectStop(currentProposal.id);
    } else if (value === 'modify' && currentProposal) {
      modifyStop(currentProposal.id);
    } else if (value === 'complete') {
      // Navigate to planner when complete
      navigate('/');
    } else if (value === 'more') {
      sendMessage(t('chat.addMoreStops'));
    } else {
      sendMessage(value);
    }
  };

  const handleStopApprove = () => {
    if (currentProposal) {
      approveStop(currentProposal.id);
    }
  };

  const handleStopReject = () => {
    if (currentProposal) {
      rejectStop(currentProposal.id);
    }
  };

  const handleStopModify = () => {
    if (currentProposal) {
      modifyStop(currentProposal.id);
    }
  };

  const handleNewConversation = () => {
    resetConversation();
    startConversation(language);
  };

  return (
    <div className={`chat-planner-page ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="chat-header glass-card">
        <button
          className="back-btn icon-btn"
          onClick={() => navigate('/')}
          aria-label={t('common.back')}
        >
          {isRTL ? '→' : '←'}
        </button>
        <div className="header-center">
          <h1>{t('chat.plannerTitle')}</h1>
          <span className="phase-badge">
            {getPhaseLabel(phase, language)}
          </span>
        </div>
        <button
          className="new-btn icon-btn"
          onClick={handleNewConversation}
          aria-label={t('chat.newConversation')}
        >
          +
        </button>
      </header>

      <main className="chat-main">
        <div className="messages-container">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role}`}
            >
              <div className="message-bubble glass-card">
                <p className="message-content">{message.content}</p>
                {message.quickReplies && message.quickReplies.length > 0 && (
                  <QuickReplyButtons
                    replies={message.quickReplies}
                    onSelect={handleQuickReply}
                    disabled={isLoading}
                  />
                )}
              </div>
            </div>
          ))}

          {currentProposal && (
            <div className="proposal-container">
              <ProposedStopCard
                proposal={currentProposal}
                onApprove={handleStopApprove}
                onReject={handleStopReject}
                onModify={handleStopModify}
                isLoading={isLoading}
              />
            </div>
          )}

          {isLoading && (
            <div className="message assistant loading">
              <div className="message-bubble glass-card">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="error-banner glass-error">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
              <button
                className="retry-btn"
                onClick={() => startConversation(language)}
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {/* Finalize Section */}
          {phase === 'finalize' && (
            <div className="finalize-section glass-card">
              {!reportUrl ? (
                <>
                  <h3>{isRTL ? '🎉 הטיול שלך מוכן!' : '🎉 Your trip is ready!'}</h3>
                  <p>
                    {isRTL
                      ? 'לחץ למטה ליצירת דוח HTML שתוכל לשתף עם חברים'
                      : 'Click below to generate a shareable HTML report'
                    }
                  </p>
                  <button
                    className="generate-report-btn primary-btn"
                    onClick={generateReport}
                    disabled={isGeneratingReport}
                  >
                    {isGeneratingReport
                      ? (isRTL ? '⏳ יוצר דוח...' : '⏳ Generating...')
                      : (isRTL ? '📄 צור דוח טיול' : '📄 Generate Trip Report')
                    }
                  </button>
                </>
              ) : (
                <div className="report-ready">
                  <h3>{isRTL ? '✅ הדוח שלך מוכן!' : '✅ Your report is ready!'}</h3>
                  <a
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="report-link primary-btn"
                  >
                    {isRTL ? '🔗 צפה ושתף את הדוח' : '🔗 View & Share Report'}
                  </a>
                  <button
                    className="start-new-btn secondary-btn"
                    onClick={handleNewConversation}
                  >
                    {isRTL ? '🆕 התחל טיול חדש' : '🆕 Start New Trip'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="chat-footer glass-card">
        <form onSubmit={handleSubmit} className="chat-input-form">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('chat.inputPlaceholder')}
            disabled={isLoading}
            className="chat-input glass-input"
            dir="auto"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="send-btn primary-btn"
            aria-label={t('chat.send')}
          >
            {isRTL ? '←' : '→'}
          </button>
        </form>
      </footer>
    </div>
  );
}
