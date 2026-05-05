import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Search,
  ArrowLeft,
  Users,
  Check,
  CheckCheck,
  Loader2,
  Hash,
  MessageCircle,
  Plus,
  X,
  Smile,
  Reply,
  Pencil,
  Trash2,
  MoreHorizontal,
  MessageSquare,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useSSE } from '../../../hooks/useSSE';
import {
  listChannels,
  createChannel,
  ensureGeneralChannel,
  listChatMessages,
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  toggleReaction,
  type ChatMessage,
  type ChatChannel,
} from '../../../lib/chatApi';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '💯', '🙌'];

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin}m`;
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ayer ${time}`;
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ${time}`;
}

const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'];

function color(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

export function WorkerChat() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const businessId = currentBusiness?.business_id || '';
  const userId = user?.user_id || '';
  const userName = user?.fullName || user?.firstName || 'Usuario';
  const userAvatar = user?.avatar || '';
  const teamMembers = useMemo(() => currentBusiness?.members || [], [currentBusiness]);

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);

  const selectedChannel = channels.find((c) => c.channelId === selectedChannelId) || null;

  const getDisplayName = useCallback(
    (ch: ChatChannel) => {
      if (ch.channelType === 'general') return '# general';
      if (ch.channelType === 'group') return `# ${ch.name}`;
      const otherId = ch.members.find((id) => id !== userId);
      const m = teamMembers.find((x) => x.user_id === otherId);
      return m?.fullName || 'Mensaje directo';
    },
    [userId, teamMembers],
  );

  // Load channels
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      setLoading(true);
      try {
        await ensureGeneralChannel(businessId);
        const res = await listChannels(businessId, userId);
        setChannels(res.channels || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId, userId]);

  // Load messages
  useEffect(() => {
    if (!businessId || !selectedChannelId) return;
    (async () => {
      setLoadingMsgs(true);
      try {
        const res = await listChatMessages(businessId, selectedChannelId, 100);
        setMessages(res.messages || []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingMsgs(false);
      }
    })();
  }, [businessId, selectedChannelId]);

  // SSE
  const token = useMemo(() => localStorage.getItem('vertial_access_token'), []);
  const sseHandlers = useMemo(
    () => ({
      chat_message: (data: unknown) => {
        const msg = data as ChatMessage;
        if (msg.businessId !== businessId) return;
        if (msg.channelId === selectedChannelId) {
          setMessages((prev) => {
            if (prev.some((m) => m.messageId === msg.messageId)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
        setChannels((prev) =>
          prev.map((ch) =>
            ch.channelId === msg.channelId
              ? { ...ch, lastMessage: { text: msg.text.slice(0, 100), userName: msg.userName }, lastMessageAt: msg.createdAt }
              : ch,
          ),
        );
      },
      chat_message_edited: (data: unknown) => {
        const { messageId, text, edited, editedAt } = data as { messageId: string; text: string; edited: boolean; editedAt: string };
        setMessages((prev) => prev.map((m) => (m.messageId === messageId ? { ...m, text, edited, editedAt } : m)));
      },
      chat_message_deleted: (data: unknown) => {
        const { messageId } = data as { messageId: string };
        setMessages((prev) => prev.map((m) => (m.messageId === messageId ? { ...m, deleted: true, text: '' } : m)));
      },
      chat_channel_created: (data: unknown) => {
        const ch = data as ChatChannel;
        if (ch.businessId !== businessId) return;
        setChannels((prev) => (prev.some((c) => c.channelId === ch.channelId) ? prev : [ch, ...prev]));
      },
      chat_reaction: (data: unknown) => {
        const { messageId, reactions } = data as { messageId: string; reactions: Record<string, string[]> };
        setMessages((prev) => prev.map((m) => (m.messageId === messageId ? { ...m, reactions } : m)));
      },
    }),
    [businessId, selectedChannelId],
  );

  useSSE({ userId, token, businessId, handlers: sseHandlers, enabled: !!userId && !!businessId });

  const handleSend = async () => {
    const text = messageInput.trim();
    if (!text || !businessId || !selectedChannelId || sending) return;
    setSending(true);
    setMessageInput('');

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      _id: `msg:${tempId}`,
      messageId: tempId,
      type: 'chat_message',
      channelId: selectedChannelId,
      businessId,
      userId,
      userName,
      userAvatar,
      text,
      replyTo: null,
      reactions: {},
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      const res = await sendChatMessage(businessId, selectedChannelId, { text, userId, userName, userAvatar });
      if (res.message) setMessages((prev) => prev.map((m) => (m.messageId === tempId ? res.message! : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.messageId !== tempId));
      setMessageInput(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleCreateDM = async (targetId: string) => {
    if (!businessId) return;
    try {
      const res = await createChannel(businessId, { name: '', channelType: 'direct', members: [userId, targetId] });
      if (res.channel) {
        if (!res.existing) setChannels((prev) => [res.channel!, ...prev]);
        setSelectedChannelId(res.channel.channelId);
        setShowNewDM(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredContacts = channels.filter((c) => getDisplayName(c).toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) {
    return (
      <Layout title={t('worker.chat.title')} subtitle={t('worker.chat.subtitle')} noPadding>
        <div className="flex items-center justify-center h-[calc(100vh-140px)]">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('worker.chat.title')} subtitle={t('worker.chat.subtitle')} noPadding>
      <div className="flex h-[calc(100vh-140px)] bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden mx-4 mb-4 sm:mx-6 sm:mb-6">
        {/* Contacts List */}
        <div className={`w-full sm:w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0 ${selectedChannel ? 'hidden sm:flex' : 'flex'}`}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Conversaciones</h3>
              <button
                onClick={() => setShowNewDM(true)}
                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredContacts.map((ch) => {
              const isActive = selectedChannelId === ch.channelId;
              const isDM = ch.channelType === 'direct';
              const otherId = isDM ? ch.members.find((id) => id !== userId) : null;
              return (
                <button
                  key={ch.channelId}
                  onClick={() => setSelectedChannelId(ch.channelId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                    isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="relative shrink-0">
                    {isDM ? (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white ${color(otherId || '')}`}>
                        {getInitials(getDisplayName(ch))}
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center">
                        {ch.channelType === 'general' ? <Hash className="w-5 h-5 text-gray-500" /> : <Users className="w-5 h-5 text-gray-500" />}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{getDisplayName(ch)}</p>
                      {ch.lastMessageAt && <span className="text-[10px] text-gray-400">{formatTime(ch.lastMessageAt)}</span>}
                    </div>
                    {ch.lastMessage && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {ch.lastMessage.userName}: {ch.lastMessage.text}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredContacts.length === 0 && (
              <div className="py-12 text-center">
                <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Sin conversaciones</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${!selectedChannel ? 'hidden sm:flex' : 'flex'}`}>
          {selectedChannel ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setSelectedChannelId(null)}
                  className="sm:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  selectedChannel.channelType === 'direct'
                    ? color(selectedChannel.members.find((id) => id !== userId) || '')
                    : 'bg-gray-400'
                }`}>
                  {selectedChannel.channelType === 'direct'
                    ? getInitials(getDisplayName(selectedChannel))
                    : <Hash className="w-4 h-4 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{getDisplayName(selectedChannel)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedChannel.channelType === 'general'
                      ? `${teamMembers.length} miembros`
                      : `${selectedChannel.members.length} miembros`}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-gray-400">Escribe el primer mensaje</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    if (msg.deleted) {
                      return (
                        <div key={msg.messageId} className="flex justify-center">
                          <span className="text-xs text-gray-400 italic">Mensaje eliminado</span>
                        </div>
                      );
                    }
                    const isMe = msg.userId === userId;
                    return (
                      <div key={msg.messageId} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
                        }`}>
                          {!isMe && (
                            <p className={`text-xs font-semibold mb-0.5 ${isMe ? 'text-blue-200' : 'text-gray-500'}`}>
                              {msg.userName}
                            </p>
                          )}
                          <p>{msg.text}</p>
                          <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                            <span className="text-[10px]">
                              {new Date(msg.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.edited && <span className="text-[10px] italic">(editado)</span>}
                            {isMe && <CheckCheck className="w-3 h-3" />}
                          </div>
                          {Object.keys(msg.reactions || {}).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(msg.reactions).map(([emoji, users]) => (
                                <span key={emoji} className="text-xs bg-white/20 rounded-full px-1.5 py-0.5">
                                  {emoji} {users.length}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!messageInput.trim() || sending}
                    className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Users className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Selecciona una conversación</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">O inicia una nueva</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New DM modal */}
      {showNewDM && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowNewDM(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Nuevo mensaje</h3>
              <button onClick={() => setShowNewDM(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {teamMembers
                .filter((m) => m.user_id !== userId)
                .map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => handleCreateDM(m.user_id)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${color(m.user_id)}`}>
                      {getInitials(m.fullName)}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.fullName}</p>
                      <p className="text-[11px] text-gray-400">{m.role || ''}</p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
