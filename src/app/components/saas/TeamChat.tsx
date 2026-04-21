import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import {
  listChatMessages,
  sendChatMessage,
  toggleReaction,
  type ChatMessage,
} from '../../lib/chatApi';
import {
  MessageSquare,
  Send,
  X,
  Smile,
  ChevronDown,
  Reply,
  Users,
  Loader2,
} from 'lucide-react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;

  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `ayer ${time}`;

  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ${time}`;
}

function shouldShowAvatar(messages: ChatMessage[], idx: number): boolean {
  if (idx === 0) return true;
  const prev = messages[idx - 1];
  const curr = messages[idx];
  if (prev.userId !== curr.userId) return true;
  const diff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return diff > 5 * 60 * 1000;
}

function shouldShowTimestamp(messages: ChatMessage[], idx: number): boolean {
  if (idx === 0) return true;
  const prev = messages[idx - 1];
  const curr = messages[idx];
  const diff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return diff > 15 * 60 * 1000;
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showAvatar: boolean;
  userId: string;
  onReply: (msg: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  allMessages: ChatMessage[];
}

function MessageBubble({ message, isOwn, showAvatar, userId, onReply, onReact, allMessages }: MessageBubbleProps) {
  const [showEmojis, setShowEmojis] = useState(false);
  const replyMsg = message.replyTo
    ? allMessages.find((m) => m.messageId === message.replyTo)
    : null;

  const hasReactions = Object.keys(message.reactions || {}).length > 0;

  return (
    <div className={`group flex gap-2 px-4 ${isOwn ? 'flex-row-reverse' : ''} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
      {/* Avatar */}
      <div className="w-7 flex-shrink-0">
        {showAvatar && !isOwn && (
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${getAvatarColor(message.userId)}`}
            title={message.userName}
          >
            {message.userAvatar ? (
              <img src={message.userAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              getInitials(message.userName)
            )}
          </div>
        )}
      </div>

      <div className={`max-w-[75%] min-w-0 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Name */}
        {showAvatar && !isOwn && (
          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5 ml-1">
            {message.userName}
          </p>
        )}

        {/* Reply context */}
        {replyMsg && (
          <div className={`flex items-center gap-1.5 mb-0.5 ml-1 ${isOwn ? 'self-end mr-1' : ''}`}>
            <Reply className="w-3 h-3 text-gray-400 rotate-180" />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
              <span className="font-semibold">{replyMsg.userName}:</span> {replyMsg.text}
            </p>
          </div>
        )}

        {/* Bubble */}
        <div className="relative">
          <div
            className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
              isOwn
                ? 'bg-blue-600 text-white rounded-tr-md'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-md'
            }`}
          >
            {message.text}
          </div>

          {/* Hover actions */}
          <div
            className={`absolute top-0 ${
              isOwn ? '-left-16' : '-right-16'
            } opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5`}
          >
            <button
              onClick={() => setShowEmojis(!showEmojis)}
              className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Smile className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button
              onClick={() => onReply(message)}
              className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Reply className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>

          {/* Emoji picker */}
          {showEmojis && (
            <div
              className={`absolute ${isOwn ? 'right-0' : 'left-0'} -bottom-8 z-20 flex items-center gap-0.5 px-1.5 py-1 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-600`}
            >
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onReact(message.messageId, e);
                    setShowEmojis(false);
                  }}
                  className="text-sm hover:scale-125 transition-transform px-0.5"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reactions */}
        {hasReactions && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end mr-1' : 'ml-1'}`}>
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(message.messageId, emoji)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                  users.includes(userId)
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                <span>{emoji}</span>
                <span className="font-semibold">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p
          className={`text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
            isOwn ? 'text-right mr-1' : 'ml-1'
          }`}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function TeamChat() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastReadRef = useRef<string | null>(null);

  const businessId = currentBusiness?.business_id || '';
  const userId = user?.user_id || '';
  const userName = user?.fullName || user?.firstName || 'Usuario';
  const userAvatar = user?.avatar || '';

  const teamMembers = useMemo(() => {
    if (!currentBusiness?.members) return [];
    return currentBusiness.members;
  }, [currentBusiness]);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await listChatMessages(businessId, 80);
      setMessages(res.messages || []);
      setTimeout(() => scrollToBottom(false), 50);
    } catch (err) {
      console.error('Error loading chat messages:', err);
    } finally {
      setLoading(false);
    }
  }, [businessId, scrollToBottom]);

  useEffect(() => {
    if (isOpen && businessId) {
      loadMessages();
      setUnreadCount(0);
      if (messages.length > 0) {
        lastReadRef.current = messages[messages.length - 1]?.createdAt || null;
      }
    }
  }, [isOpen, businessId, loadMessages]);

  const handleIncomingMessage = useCallback(
    (data: unknown) => {
      const msg = data as ChatMessage;
      if (msg.businessId !== businessId) return;

      setMessages((prev) => {
        if (prev.some((m) => m.messageId === msg.messageId)) return prev;
        return [...prev, msg];
      });

      if (!isOpen || document.hidden) {
        setUnreadCount((c) => c + 1);
      } else {
        setTimeout(() => scrollToBottom(), 100);
      }
    },
    [businessId, isOpen, scrollToBottom],
  );

  const handleReactionUpdate = useCallback((data: unknown) => {
    const { messageId, reactions } = data as { messageId: string; reactions: Record<string, string[]> };
    setMessages((prev) =>
      prev.map((m) => (m.messageId === messageId ? { ...m, reactions } : m)),
    );
  }, []);

  const token = useMemo(() => localStorage.getItem('udar_access_token'), []);

  const sseHandlers = useMemo(
    () => ({
      chat_message: handleIncomingMessage,
      chat_reaction: handleReactionUpdate,
    }),
    [handleIncomingMessage, handleReactionUpdate],
  );

  useSSE({
    userId,
    token,
    businessId,
    handlers: sseHandlers,
    enabled: !!userId && !!businessId,
  });

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !businessId || sending) return;

    setSending(true);
    setInputText('');

    const optimisticMsg: ChatMessage = {
      _id: `msg:temp-${Date.now()}`,
      messageId: `temp-${Date.now()}`,
      type: 'chat_message',
      businessId,
      userId,
      userName,
      userAvatar,
      text,
      replyTo: replyTo?.messageId || null,
      reactions: {},
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setReplyTo(null);
    setTimeout(() => scrollToBottom(), 50);

    try {
      const res = await sendChatMessage(businessId, {
        text,
        userId,
        userName,
        userAvatar,
        replyTo: replyTo?.messageId,
      });

      if (res.message) {
        setMessages((prev) =>
          prev.map((m) => (m.messageId === optimisticMsg.messageId ? res.message! : m)),
        );
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setMessages((prev) => prev.filter((m) => m.messageId !== optimisticMsg.messageId));
      setInputText(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!businessId) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.messageId !== messageId) return m;
        const reactions = { ...m.reactions };
        if (!reactions[emoji]) reactions[emoji] = [];
        const idx = reactions[emoji].indexOf(userId);
        if (idx >= 0) {
          reactions[emoji] = reactions[emoji].filter((id) => id !== userId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...reactions[emoji], userId];
        }
        return { ...m, reactions };
      }),
    );

    try {
      await toggleReaction(businessId, messageId, { emoji, userId });
    } catch (err) {
      console.error('Error toggling reaction:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollDown(!isNearBottom);
  };

  if (!businessId || !userId) return null;

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl shadow-xl shadow-blue-600/25 transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-sm font-semibold">Chat del equipo</span>
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[560px] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold">Chat del equipo</p>
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 opacity-70" />
                  <p className="text-[10px] opacity-80">
                    {teamMembers.length} miembro{teamMembers.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-xl hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto py-3 scroll-smooth"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                <p className="text-xs text-gray-400">Cargando mensajes...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center">
                  <MessageSquare className="w-7 h-7 text-blue-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Sin mensajes aún
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Sé el primero en escribir al equipo
                  </p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => {
                  const showTs = shouldShowTimestamp(messages, i);
                  const showAv = shouldShowAvatar(messages, i);
                  return (
                    <div key={msg.messageId}>
                      {showTs && (
                        <div className="flex items-center justify-center my-3">
                          <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        message={msg}
                        isOwn={msg.userId === userId}
                        showAvatar={showAv}
                        userId={userId}
                        onReply={(m) => {
                          setReplyTo(m);
                          inputRef.current?.focus();
                        }}
                        onReact={handleReact}
                        allMessages={messages}
                      />
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Scroll to bottom */}
          {showScrollDown && (
            <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2">
              <button
                onClick={() => scrollToBottom()}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-900/80 dark:bg-gray-100/80 backdrop-blur-sm text-white dark:text-gray-900 rounded-full text-[11px] font-semibold shadow-lg hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Nuevos mensajes
              </button>
            </div>
          )}

          {/* Reply bar */}
          {replyTo && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-800 flex-shrink-0">
              <Reply className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 rotate-180" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-blue-600">{replyTo.userName}</p>
                <p className="text-[11px] text-blue-500/70 truncate">{replyTo.text}</p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors"
              >
                <X className="w-3 h-3 text-blue-500" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe un mensaje..."
                  rows={1}
                  className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all max-h-[80px]"
                  style={{ minHeight: '40px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = '40px';
                    target.style.height = Math.min(target.scrollHeight, 80) + 'px';
                  }}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || sending}
                className="flex-shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:scale-100"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
