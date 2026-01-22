/**
 * Conversation Context
 * State management for AI-powered trip planning conversations
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  ConversationState,
  ConversationMessage,
  ConversationPhase,
  ProposedStop,
} from '../types/conversation';
import { chatPlanApi } from '../api/client';

interface ConversationContextType {
  // State
  conversationId: string | null;
  phase: ConversationPhase;
  messages: ConversationMessage[];
  currentProposal: ProposedStop | null;
  isLoading: boolean;
  error: string | null;
  reportUrl: string | null;
  isGeneratingReport: boolean;

  // Actions
  startConversation: (language?: 'he' | 'en') => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  approveStop: (stopId: string) => Promise<void>;
  rejectStop: (stopId: string) => Promise<void>;
  modifyStop: (stopId: string, reason?: string) => Promise<void>;
  resetConversation: () => void;
  generateReport: () => Promise<string | null>;
}

const ConversationContext = createContext<ConversationContextType | undefined>(
  undefined
);

interface ConversationProviderProps {
  children: ReactNode;
}

export function ConversationProvider({ children }: ConversationProviderProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConversationPhase>('greeting');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentProposal, setCurrentProposal] = useState<ProposedStop | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const updateFromState = useCallback((state: Partial<ConversationState>) => {
    if (state.id) setConversationId(state.id);
    if (state.phase) setPhase(state.phase);
    if (state.messages) setMessages(state.messages);
    if (state.currentProposal !== undefined) {
      setCurrentProposal(state.currentProposal || null);
    }
  }, []);

  const startConversation = useCallback(async (language: 'he' | 'en' = 'he') => {
    setIsLoading(true);
    setError(null);

    try {
      // Send empty message to start conversation
      const response = await chatPlanApi.sendMessage({
        message: 'שלום', // Hello in Hebrew
        language,
      });

      setConversationId(response.conversationId);
      setPhase(response.phase);
      setMessages([response.message]);
      setCurrentProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setIsLoading(true);
    setError(null);

    // Add user message optimistically
    const userMessage: ConversationMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      phase,
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await chatPlanApi.sendMessage({
        conversationId: conversationId || undefined,
        message: text,
        language: 'he', // Default to Hebrew
      });

      // Update with real response
      setConversationId(response.conversationId);
      setPhase(response.phase);

      // Replace temp message and add assistant response
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== userMessage.id);
        return [...withoutTemp, { ...userMessage, id: `user-${Date.now()}` }, response.message];
      });

      if (response.state) {
        updateFromState(response.state);
      }
    } catch (err) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, phase, updateFromState]);

  const approveStop = useCallback(async (stopId: string) => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await chatPlanApi.handleStopDecision({
        conversationId,
        stopId,
        decision: 'approve',
      });

      setPhase(response.nextPhase);
      setMessages(prev => [...prev, response.message]);
      setCurrentProposal(response.newProposal || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve stop');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const rejectStop = useCallback(async (stopId: string) => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await chatPlanApi.handleStopDecision({
        conversationId,
        stopId,
        decision: 'reject',
      });

      setPhase(response.nextPhase);
      setMessages(prev => [...prev, response.message]);
      setCurrentProposal(response.newProposal || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject stop');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const modifyStop = useCallback(async (stopId: string, reason?: string) => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await chatPlanApi.handleStopDecision({
        conversationId,
        stopId,
        decision: 'modify',
        modifications: reason ? { reason } : undefined,
      });

      setPhase(response.nextPhase);
      setMessages(prev => [...prev, response.message]);
      setCurrentProposal(response.newProposal || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify stop');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const resetConversation = useCallback(() => {
    setConversationId(null);
    setPhase('greeting');
    setMessages([]);
    setCurrentProposal(null);
    setIsLoading(false);
    setError(null);
    setReportUrl(null);
    setIsGeneratingReport(false);
  }, []);

  const generateReport = useCallback(async (): Promise<string | null> => {
    if (!conversationId) {
      setError('No active conversation');
      return null;
    }

    setIsGeneratingReport(true);
    setError(null);

    try {
      const response = await fetch('/api/report/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate report');
      }

      const data = await response.json();
      if (data.report_url) {
        setReportUrl(data.report_url);
        return data.report_url;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      return null;
    } finally {
      setIsGeneratingReport(false);
    }
  }, [conversationId]);

  const value: ConversationContextType = {
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
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation(): ConversationContextType {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
}
