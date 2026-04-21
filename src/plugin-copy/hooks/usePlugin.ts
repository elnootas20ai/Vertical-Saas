import { useState, useCallback, useRef, useEffect } from 'react';
import type { Agent, AgentType, AgentCategory, QueueItem, ChatMessage } from '../types';
import { agentApi } from '../lib/api';

export function usePlugin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentCategories, setAgentCategories] = useState<AgentCategory[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState('');
  const termCleanupRef = useRef<(() => void) | null>(null);
  const queueCleanupRef = useRef<(() => void) | null>(null);
  const chatCleanupRef = useRef<(() => void) | null>(null);

  const activeAgent = agents.find((a) => a.id === activeAgentId) || null;

  const loadAgents = useCallback(async () => {
    try {
      const data = await agentApi.list();
      setAgents(data.agents);
      setAgentCategories(data.categories);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectAgent = useCallback((id: string) => {
    setActiveAgentId(id);
    setTerminalOutput('');
  }, []);

  const createAgent = useCallback(
    async (name: string, type?: AgentType, cwd?: string, model?: string, prompt?: string) => {
      const agent = await agentApi.create({ name, type: type || 'conversation', cwd, model, prompt });
      setAgents((prev) => [agent, ...prev]);
      selectAgent(agent.id);
      return agent;
    },
    [selectAgent],
  );

  const renameAgent = useCallback(async (id: string, name: string) => {
    const updated = await agentApi.update(id, { name });
    setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, []);

  const updateModel = useCallback(async (id: string, model: string) => {
    const updated = await agentApi.update(id, { model });
    setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, []);

  const removeAgent = useCallback(
    async (id: string) => {
      await agentApi.remove(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      if (activeAgentId === id) {
        setActiveAgentId(null);
        setTerminalOutput('');
      }
    },
    [activeAgentId],
  );

  const updateAgentCategory = useCallback(async (agentId: string, category: string) => {
    const updated = await agentApi.update(agentId, { category });
    setAgents((prev) => prev.map((a) => (a.id === agentId ? updated : a)));
  }, []);

  const reorderAgentList = useCallback(async (orderedIds: string[]) => {
    const result = await agentApi.reorderAgents(orderedIds);
    if (result.agents) setAgents(result.agents);
  }, []);

  const addAgentCategory = useCallback(async (name: string) => {
    const cat = await agentApi.createAgentCategory(name);
    setAgentCategories((prev) => [...prev, cat]);
    return cat;
  }, []);

  const removeAgentCategory = useCallback(async (catId: string) => {
    await agentApi.deleteAgentCategory(catId);
    setAgentCategories((prev) => prev.filter((c) => c.id !== catId));
    setAgents((prev) => prev.map((a) => (a.category === catId ? { ...a, category: 'general' } : a)));
  }, []);

  const sendCommand = useCallback(
    async (command: string) => {
      if (!activeAgentId) return;
      setError(null);
      try {
        await agentApi.exec(activeAgentId, command);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [activeAgentId],
  );

  const sendSignal = useCallback(
    async (signal: string) => {
      if (!activeAgentId) return;
      try {
        await agentApi.sendSignal(activeAgentId, signal);
      } catch { /* best effort */ }
    },
    [activeAgentId],
  );

  const restartTerminal = useCallback(async () => {
    if (!activeAgentId) return;
    setTerminalOutput('');
    try {
      await agentApi.restart(activeAgentId);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [activeAgentId]);

  const deselectAgent = useCallback(() => {
    setActiveAgentId(null);
    setTerminalOutput('');
  }, []);

  // Terminal SSE watcher
  useEffect(() => {
    if (termCleanupRef.current) {
      termCleanupRef.current();
      termCleanupRef.current = null;
    }
    if (!activeAgentId) return;

    const cleanup = agentApi.watchTerminal(activeAgentId, (event) => {
      if (event.type === 'buffer' || event.type === 'output') {
        setTerminalOutput((prev) => {
          const next = prev + event.content;
          return next.length > 200_000 ? next.slice(-150_000) : next;
        });
      }
    });

    termCleanupRef.current = cleanup;
    return cleanup;
  }, [activeAgentId]);

  // ── Chat ──

  const sendMessage = useCallback(
    async (content: string, attachedFiles?: string[]) => {
      if (!activeAgentId) return;
      setError(null);
      setIsStreaming(true);
      try {
        await agentApi.sendMessage(activeAgentId, content, attachedFiles);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsStreaming(false);
      }
    },
    [activeAgentId],
  );

  const clearMessages = useCallback(async () => {
    if (!activeAgentId) return;
    await agentApi.clearMessages(activeAgentId);
    setMessages([]);
  }, [activeAgentId]);

  // Chat SSE watcher
  useEffect(() => {
    if (chatCleanupRef.current) {
      chatCleanupRef.current();
      chatCleanupRef.current = null;
    }
    if (!activeAgentId) {
      setMessages([]);
      return;
    }

    const agent = agents.find((a) => a.id === activeAgentId);
    if (!agent || (agent.type !== 'conversation' && agent.type !== 'cursor')) return;

    const cleanup = agentApi.watchChat(activeAgentId, (event) => {
      if (event.type === 'thinking_start' || event.type === 'message_start') {
        setAgents((prev) => prev.map((a) => a.id === activeAgentId ? { ...a, status: 'running' } : a));
      } else if (event.type === 'message_done' || event.type === 'message_error') {
        setAgents((prev) => prev.map((a) => a.id === activeAgentId ? { ...a, status: 'idle', updatedAt: new Date().toISOString() } : a));
      }

      if (event.type === 'init' && event.messages) {
        setMessages(event.messages);
      } else if (event.type === 'message' && event.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.message!.id)) return prev;
          return [...prev, event.message!];
        });
      } else if (event.type === 'thinking_start') {
        setIsThinking(true);
        setThinkingText('');
      } else if (event.type === 'thinking_done') {
        setIsThinking(false);
        setThinkingText((event as any).thinking || '');
      } else if (event.type === 'message_start' && event.message) {
        const msg = { ...event.message!, thinking: thinkingText };
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setIsStreaming(true);
        setThinkingText('');
      } else if (event.type === 'tool_call' && event.messageId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== event.messageId) return m;
            const toolCalls = [...(m.toolCalls || [])];
            const tc = (event as any).toolCall;
            if ((event as any).subtype === 'started' && tc) {
              toolCalls.push(tc);
            } else if ((event as any).subtype === 'completed' && toolCalls.length > 0) {
              toolCalls[toolCalls.length - 1] = { ...toolCalls[toolCalls.length - 1], done: true };
            }
            return { ...m, toolCalls };
          }),
        );
      } else if (event.type === 'chunk' && event.messageId && event.delta) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, content: m.content + event.delta } : m,
          ),
        );
      } else if (event.type === 'message_done' || event.type === 'message_error') {
        setIsStreaming(false);
        setIsThinking(false);
        if (event.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === event.message!.id ? { ...event.message!, thinking: m.thinking } : m)),
          );
        }
        window.dispatchEvent(new CustomEvent('plugin:message_done'));
      } else if (event.type === 'rewind' && (event as any).messages) {
        setMessages((event as any).messages);
        setIsStreaming(false);
        setIsThinking(false);
      } else if (event.type === 'versions_updated') {
        window.dispatchEvent(new CustomEvent('plugin:versions_updated', {
          detail: { agentId: activeAgentId, versions: (event as any).versions },
        }));
      }
    });

    chatCleanupRef.current = cleanup;
    return cleanup;
  }, [activeAgentId, agents]);

  // ── Queue ──

  const loadQueue = useCallback(async (agentId: string) => {
    try {
      const items = await agentApi.getQueue(agentId);
      setQueue(items);
    } catch { /* ignore */ }
  }, []);

  const addToQueue = useCallback(
    async (message: string, priority: 'normal' | 'high' = 'normal') => {
      if (!activeAgentId) return;
      const item = await agentApi.addToQueue(activeAgentId, message, priority);
      setQueue((prev) => [...prev, item]);
    },
    [activeAgentId],
  );

  const removeFromQueue = useCallback(
    async (itemId: string) => {
      if (!activeAgentId) return;
      await agentApi.removeFromQueue(activeAgentId, itemId);
      setQueue((prev) => prev.filter((i) => i.id !== itemId));
    },
    [activeAgentId],
  );

  const clearQueueItems = useCallback(async () => {
    if (!activeAgentId) return;
    await agentApi.clearQueue(activeAgentId);
    setQueue((prev) => prev.filter((i) => i.status === 'processing'));
  }, [activeAgentId]);

  const reorderQueueItem = useCallback(
    async (itemId: string, direction: 'up' | 'down') => {
      if (!activeAgentId) return;
      const result = await agentApi.reorderQueue(activeAgentId, itemId, direction);
      if (result.queue) setQueue(result.queue);
    },
    [activeAgentId],
  );

  useEffect(() => {
    if (queueCleanupRef.current) {
      queueCleanupRef.current();
      queueCleanupRef.current = null;
    }
    if (!activeAgentId) {
      setQueue([]);
      return;
    }
    loadQueue(activeAgentId);
    const cleanup = agentApi.watchQueue(activeAgentId, (event) => {
      if (event.queue) setQueue(event.queue);
    });
    queueCleanupRef.current = cleanup;
    return cleanup;
  }, [activeAgentId, loadQueue]);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 5000);
    return () => clearInterval(interval);
  }, [loadAgents]);

  return {
    agents,
    agentCategories,
    activeAgent,
    activeAgentId,
    terminalOutput,
    loading,
    error,
    selectAgent,
    deselectAgent,
    createAgent,
    renameAgent,
    updateModel,
    removeAgent,
    updateAgentCategory,
    reorderAgentList,
    addAgentCategory,
    removeAgentCategory,
    sendCommand,
    sendSignal,
    restartTerminal,
    setError,
    queue,
    addToQueue,
    removeFromQueue,
    clearQueueItems,
    reorderQueueItem,
    messages,
    isStreaming,
    isThinking,
    sendMessage,
    clearMessages,
  };
}
