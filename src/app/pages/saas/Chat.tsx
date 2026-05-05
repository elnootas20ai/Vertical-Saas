import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import {
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  ensureGeneralChannel,
  listChatMessages,
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  toggleReaction,
  type ChatMessage,
  type ChatChannel,
} from '../../lib/chatApi';
import {
  MessageSquare,
  Send,
  Smile,
  Reply,
  Users,
  Loader2,
  Search,
  Hash,
  ChevronDown,
  X,
  Plus,
  UserPlus,
  Settings,
  Trash2,
  Pencil,
  Check,
  MoreHorizontal,
  MessageCircle,
  Archive,
  AtSign,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '💯', '🙌', '😍', '🤔', '👏', '✅'];

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

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();

  if (d.toDateString() === now.toDateString()) return 'Hoy';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';

  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function shouldShowAvatar(messages: ChatMessage[], idx: number): boolean {
  if (idx === 0) return true;
  const prev = messages[idx - 1];
  const curr = messages[idx];
  if (prev.userId !== curr.userId) return true;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000;
}

function shouldShowDateSeparator(messages: ChatMessage[], idx: number): boolean {
  if (idx === 0) return true;
  const prev = new Date(messages[idx - 1].createdAt).toDateString();
  const curr = new Date(messages[idx].createdAt).toDateString();
  return prev !== curr;
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
  'bg-teal-500', 'bg-orange-500',
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── MessageRow ─────────────────────────────────────────────────────────────

interface MessageRowProps {
  message: ChatMessage;
  isOwn: boolean;
  showAvatar: boolean;
  userId: string;
  onReply: (msg: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  allMessages: ChatMessage[];
}

function MessageRow({ message, isOwn, showAvatar, userId, onReply, onReact, onEdit, onDelete, allMessages }: MessageRowProps) {
  const [showEmojis, setShowEmojis] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const replyMsg = message.replyTo
    ? allMessages.find((m) => m.messageId === message.replyTo)
    : null;

  const hasReactions = Object.keys(message.reactions || {}).length > 0;

  if (message.deleted) {
    return (
      <div className={`group relative flex gap-3 px-6 py-0.5 ${showAvatar ? 'mt-4' : 'mt-0'}`}>
        <div className="w-9 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">Mensaje eliminado</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative flex gap-3 px-6 py-0.5 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors ${
        showAvatar ? 'mt-4' : 'mt-0'
      }`}
    >
      <div className="w-9 flex-shrink-0 pt-0.5">
        {showAvatar && (
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ${getAvatarColor(message.userId)}`}
            title={message.userName}
          >
            {message.userAvatar ? (
              <img src={message.userAvatar} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              getInitials(message.userName)
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`text-sm font-bold ${isOwn ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {message.userName}
            </span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {formatTime(message.createdAt)}
            </span>
            {message.edited && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">(editado)</span>
            )}
          </div>
        )}

        {replyMsg && (
          <div className="flex items-center gap-2 mb-1 pl-3 border-l-2 border-blue-300 dark:border-blue-600">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white ${getAvatarColor(replyMsg.userId)}`}
              >
                {getInitials(replyMsg.userName)}
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{replyMsg.userName}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-md">{replyMsg.text}</span>
            </div>
          </div>
        )}

        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed break-words whitespace-pre-wrap">
          {message.text}
        </p>

        {hasReactions && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(message.messageId, emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all hover:scale-105 ${
                  users.includes(userId)
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span>{emoji}</span>
                <span className="font-semibold">{users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute right-4 -top-3 opacity-0 group-hover:opacity-100 transition-all z-20">
        <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
          <button
            onClick={() => setShowEmojis(!showEmojis)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Reaccionar"
          >
            <Smile className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={() => onReply(message)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Responder"
          >
            <Reply className="w-4 h-4 text-gray-500" />
          </button>
          {isOwn && (
            <>
              <button
                onClick={() => onEdit(message)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Editar"
              >
                <Pencil className="w-4 h-4 text-gray-500" />
              </button>
              <button
                onClick={() => {
                  setShowMenu(!showMenu);
                }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Más"
              >
                <MoreHorizontal className="w-4 h-4 text-gray-500" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete menu */}
      {showMenu && isOwn && (
        <div className="absolute right-4 top-6 z-30 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 py-1 min-w-[160px]">
          <button
            onClick={() => {
              onDelete(message);
              setShowMenu(false);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar mensaje
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmojis && (
        <div className="absolute right-4 top-6 z-30 grid grid-cols-6 gap-0.5 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                onReact(message.messageId, e);
                setShowEmojis(false);
              }}
              className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {!showAvatar && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity w-9 text-center">
          {new Date(message.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

// ─── NewChatModal ───────────────────────────────────────────────────────────

interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  onCreateDM: (memberId: string) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  members: Array<{ user_id: string; fullName: string; role?: string; email?: string }>;
  userId: string;
}

function NewChatModal({ open, onClose, onCreateDM, onCreateGroup, members, userId }: NewChatModalProps) {
  const [mode, setMode] = useState<'select' | 'group'>('select');
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQ, setSearchQ] = useState('');

  if (!open) return null;

  const otherMembers = members.filter((m) => m.user_id !== userId);
  const filtered = otherMembers.filter(
    (m) =>
      m.fullName.toLowerCase().includes(searchQ.toLowerCase()) ||
      (m.email || '').toLowerCase().includes(searchQ.toLowerCase()),
  );

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedMembers.length > 0) {
      onCreateGroup(groupName.trim(), [...selectedMembers, userId]);
      setGroupName('');
      setSelectedMembers([]);
      setMode('select');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {mode === 'select' ? 'Nueva conversación' : 'Crear grupo'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {mode === 'select' && (
          <>
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setMode('group')}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Crear grupo</p>
                  <p className="text-xs text-gray-500">Chat con varios miembros del equipo</p>
                </div>
              </button>
            </div>

            <div className="px-5 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Buscar miembros..."
                  className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-2">Mensaje directo</p>
              {filtered.map((member) => (
                <button
                  key={member.user_id}
                  onClick={() => {
                    onCreateDM(member.user_id);
                    onClose();
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${getAvatarColor(member.user_id)}`}>
                    {getInitials(member.fullName)}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{member.fullName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{member.role || member.email || ''}</p>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No se encontraron miembros</p>
              )}
            </div>
          </>
        )}

        {mode === 'group' && (
          <>
            <div className="px-5 py-3 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Nombre del grupo</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ej: Marketing, Ventas..."
                  className="w-full px-3 py-2.5 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  autoFocus
                />
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Buscar miembros..."
                  className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            {selectedMembers.length > 0 && (
              <div className="px-5 py-1 flex flex-wrap gap-1.5">
                {selectedMembers.map((id) => {
                  const m = members.find((x) => x.user_id === id);
                  if (!m) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium"
                    >
                      {m.fullName}
                      <button onClick={() => toggleMember(id)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {filtered.map((member) => {
                const selected = selectedMembers.includes(member.user_id);
                return (
                  <button
                    key={member.user_id}
                    onClick={() => toggleMember(member.user_id)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors ${
                      selected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${getAvatarColor(member.user_id)}`}>
                      {getInitials(member.fullName)}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{member.fullName}</p>
                      <p className="text-[11px] text-gray-400 truncate">{member.role || ''}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      selected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                onClick={() => { setMode('select'); setSelectedMembers([]); setGroupName(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.length === 0}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Crear grupo ({selectedMembers.length})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Chat Component ────────────────────────────────────────────────────

export function Chat() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { channelId: urlChannelId } = useParams<{ channelId?: string }>();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(urlChannelId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showMobileSidebar, setShowMobileSidebar] = useState(!urlChannelId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const businessId = currentBusiness?.business_id || '';
  const userId = user?.user_id || '';
  const userName = user?.fullName || user?.firstName || 'Usuario';
  const userAvatar = user?.avatar || '';

  const teamMembers = useMemo(() => {
    if (!currentBusiness?.members) return [];
    return currentBusiness.members;
  }, [currentBusiness]);

  const activeChannel = useMemo(() => {
    return channels.find((ch) => ch.channelId === activeChannelId) || null;
  }, [channels, activeChannelId]);

  // ─── Channel name resolver for DMs ──────────────────────────────────────

  const getChannelDisplayName = useCallback(
    (channel: ChatChannel) => {
      if (channel.channelType === 'general') return '# general';
      if (channel.channelType === 'group') return `# ${channel.name}`;
      if (channel.channelType === 'direct') {
        const otherId = channel.members.find((id) => id !== userId);
        const member = teamMembers.find((m) => m.user_id === otherId);
        return member?.fullName || 'Mensaje directo';
      }
      return channel.name || 'Canal';
    },
    [userId, teamMembers],
  );

  const getChannelIcon = (channel: ChatChannel) => {
    if (channel.channelType === 'direct') return <MessageCircle className="w-4 h-4" />;
    if (channel.channelType === 'group') return <Users className="w-4 h-4" />;
    return <Hash className="w-4 h-4" />;
  };

  // ─── Load channels ──────────────────────────────────────────────────────

  const loadChannels = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      await ensureGeneralChannel(businessId);
      const res = await listChannels(businessId, userId);
      const chs = res.channels || [];
      setChannels(chs);

      if (!activeChannelId && chs.length > 0) {
        const general = chs.find((ch) => ch.channelType === 'general');
        const firstId = general?.channelId || chs[0].channelId;
        setActiveChannelId(firstId);
        navigate(`/saas/chat/${firstId}`, { replace: true });
      }
    } catch (err) {
      console.error('Error loading channels:', err);
    } finally {
      setLoading(false);
    }
  }, [businessId, userId, activeChannelId, navigate]);

  useEffect(() => {
    if (businessId) loadChannels();
  }, [businessId, loadChannels]);

  // Sync URL param
  useEffect(() => {
    if (urlChannelId && urlChannelId !== activeChannelId) {
      setActiveChannelId(urlChannelId);
    }
  }, [urlChannelId]);

  // ─── Load messages ────────────────────────────────────────────────────

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!businessId || !activeChannelId) return;
    setLoadingMessages(true);
    try {
      const res = await listChatMessages(businessId, activeChannelId, 100);
      setMessages(res.messages || []);
      setTimeout(() => scrollToBottom(false), 50);
    } catch (err) {
      console.error('Error loading chat messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [businessId, activeChannelId, scrollToBottom]);

  useEffect(() => {
    if (activeChannelId) {
      loadMessages();
      setReplyTo(null);
      setEditingMessage(null);
      setInputText('');
    }
  }, [activeChannelId, loadMessages]);

  // ─── SSE handlers ─────────────────────────────────────────────────────

  const handleIncomingMessage = useCallback(
    (data: unknown) => {
      const msg = data as ChatMessage;
      if (msg.businessId !== businessId) return;

      if (msg.channelId === activeChannelId) {
        setMessages((prev) => {
          if (prev.some((m) => m.messageId === msg.messageId)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => scrollToBottom(), 100);
      }

      setChannels((prev) =>
        prev.map((ch) =>
          ch.channelId === msg.channelId
            ? {
                ...ch,
                lastMessage: { text: msg.text.slice(0, 100), userName: msg.userName },
                lastMessageAt: msg.createdAt,
                updatedAt: msg.createdAt,
              }
            : ch,
        ),
      );
    },
    [businessId, activeChannelId, scrollToBottom],
  );

  const handleReactionUpdate = useCallback((data: unknown) => {
    const { messageId, reactions } = data as { messageId: string; reactions: Record<string, string[]> };
    setMessages((prev) =>
      prev.map((m) => (m.messageId === messageId ? { ...m, reactions } : m)),
    );
  }, []);

  const handleMessageEdited = useCallback((data: unknown) => {
    const { messageId, text, edited, editedAt } = data as {
      messageId: string;
      text: string;
      edited: boolean;
      editedAt: string;
    };
    setMessages((prev) =>
      prev.map((m) => (m.messageId === messageId ? { ...m, text, edited, editedAt } : m)),
    );
  }, []);

  const handleMessageDeleted = useCallback((data: unknown) => {
    const { messageId } = data as { messageId: string };
    setMessages((prev) =>
      prev.map((m) => (m.messageId === messageId ? { ...m, deleted: true, text: '' } : m)),
    );
  }, []);

  const handleChannelCreated = useCallback(
    (data: unknown) => {
      const ch = data as ChatChannel;
      if (ch.businessId !== businessId) return;
      setChannels((prev) => {
        if (prev.some((c) => c.channelId === ch.channelId)) return prev;
        return [ch, ...prev];
      });
    },
    [businessId],
  );

  const handleChannelUpdated = useCallback(
    (data: unknown) => {
      const ch = data as ChatChannel;
      if (ch.businessId !== businessId) return;
      setChannels((prev) => prev.map((c) => (c.channelId === ch.channelId ? ch : c)));
    },
    [businessId],
  );

  const handleChannelDeleted = useCallback(
    (data: unknown) => {
      const { channelId } = data as { channelId: string };
      setChannels((prev) => prev.filter((c) => c.channelId !== channelId));
      if (activeChannelId === channelId) {
        setActiveChannelId(null);
        navigate('/saas/chat', { replace: true });
      }
    },
    [activeChannelId, navigate],
  );

  const token = useMemo(() => localStorage.getItem('vertial_access_token'), []);

  const sseHandlers = useMemo(
    () => ({
      chat_message: handleIncomingMessage,
      chat_reaction: handleReactionUpdate,
      chat_message_edited: handleMessageEdited,
      chat_message_deleted: handleMessageDeleted,
      chat_channel_created: handleChannelCreated,
      chat_channel_updated: handleChannelUpdated,
      chat_channel_deleted: handleChannelDeleted,
    }),
    [handleIncomingMessage, handleReactionUpdate, handleMessageEdited, handleMessageDeleted, handleChannelCreated, handleChannelUpdated, handleChannelDeleted],
  );

  useSSE({
    userId,
    token,
    businessId,
    handlers: sseHandlers,
    enabled: !!userId && !!businessId,
  });

  // ─── Actions ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !businessId || !activeChannelId || sending) return;

    if (editingMessage) {
      setSending(true);
      try {
        await editChatMessage(businessId, editingMessage.messageId, { text, userId });
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === editingMessage.messageId
              ? { ...m, text, edited: true, editedAt: new Date().toISOString() }
              : m,
          ),
        );
      } catch (err) {
        console.error('Error editing message:', err);
      } finally {
        setSending(false);
        setEditingMessage(null);
        setInputText('');
        inputRef.current?.focus();
      }
      return;
    }

    setSending(true);
    setInputText('');

    const optimisticMsg: ChatMessage = {
      _id: `msg:temp-${Date.now()}`,
      messageId: `temp-${Date.now()}`,
      type: 'chat_message',
      channelId: activeChannelId,
      businessId,
      userId,
      userName,
      userAvatar,
      text,
      replyTo: replyTo?.messageId || null,
      reactions: {},
      edited: false,
      editedAt: null,
      deleted: false,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setReplyTo(null);
    setTimeout(() => scrollToBottom(), 50);

    try {
      const res = await sendChatMessage(businessId, activeChannelId, {
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

  const handleEdit = (msg: ChatMessage) => {
    setEditingMessage(msg);
    setInputText(msg.text);
    setReplyTo(null);
    inputRef.current?.focus();
  };

  const handleDelete = async (msg: ChatMessage) => {
    if (!businessId) return;
    try {
      await deleteChatMessage(businessId, msg.messageId, userId);
      setMessages((prev) =>
        prev.map((m) => (m.messageId === msg.messageId ? { ...m, deleted: true, text: '' } : m)),
      );
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  const handleCreateDM = async (targetUserId: string) => {
    if (!businessId) return;
    try {
      const res = await createChannel(businessId, {
        name: '',
        channelType: 'direct',
        members: [userId, targetUserId],
      });
      if (res.channel) {
        if (!res.existing) {
          setChannels((prev) => [res.channel!, ...prev]);
        }
        setActiveChannelId(res.channel.channelId);
        navigate(`/saas/chat/${res.channel.channelId}`);
        setShowMobileSidebar(false);
      }
    } catch (err) {
      console.error('Error creating DM:', err);
    }
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    if (!businessId) return;
    try {
      const res = await createChannel(businessId, {
        name,
        channelType: 'group',
        members: memberIds,
      });
      if (res.channel) {
        setChannels((prev) => [res.channel!, ...prev]);
        setActiveChannelId(res.channel.channelId);
        navigate(`/saas/chat/${res.channel.channelId}`);
        setShowMobileSidebar(false);
        setShowNewChat(false);
      }
    } catch (err) {
      console.error('Error creating group:', err);
    }
  };

  const handleSelectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    navigate(`/saas/chat/${channelId}`);
    setShowMobileSidebar(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && editingMessage) {
      setEditingMessage(null);
      setInputText('');
    }
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollDown(!isNearBottom);
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) => m.text.toLowerCase().includes(q) || m.userName.toLowerCase().includes(q),
    );
  }, [messages, searchQuery]);

  const filteredChannels = useMemo(() => {
    if (!sidebarSearch.trim()) return channels;
    const q = sidebarSearch.toLowerCase();
    return channels.filter((ch) => {
      const name = getChannelDisplayName(ch).toLowerCase();
      return name.includes(q);
    });
  }, [channels, sidebarSearch, getChannelDisplayName]);

  const generalChannels = filteredChannels.filter((ch) => ch.channelType === 'general' || ch.channelType === 'group');
  const dmChannels = filteredChannels.filter((ch) => ch.channelType === 'direct');

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout title="Chat" noPadding>
        <div className="flex items-center justify-center h-[calc(100dvh-4rem)]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm text-gray-400">Cargando chat...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Chat" noPadding>
      <div className="flex h-[calc(100dvh-4rem)] overflow-hidden">
        {/* ─── Sidebar ─── */}
        <div className={`${showMobileSidebar ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-72 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0`}>
          {/* Sidebar header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Chat</h2>
              <button
                onClick={() => setShowNewChat(true)}
                className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                title="Nueva conversación"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Buscar conversaciones..."
                className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto py-2">
            {/* Channels & Groups */}
            {generalChannels.length > 0 && (
              <div className="mb-3">
                <p className="px-4 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                  Canales
                </p>
                {generalChannels.map((ch) => (
                  <button
                    key={ch.channelId}
                    onClick={() => handleSelectChannel(ch.channelId)}
                    className={`flex items-center gap-2.5 w-full px-4 py-2 text-left transition-colors ${
                      activeChannelId === ch.channelId
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span className="text-gray-400 flex-shrink-0">{getChannelIcon(ch)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{getChannelDisplayName(ch)}</p>
                      {ch.lastMessage && (
                        <p className="text-[11px] text-gray-400 truncate">
                          {ch.lastMessage.userName}: {ch.lastMessage.text}
                        </p>
                      )}
                    </div>
                    {ch.lastMessageAt && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {formatTime(ch.lastMessageAt)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Direct Messages */}
            {dmChannels.length > 0 && (
              <div>
                <p className="px-4 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                  Mensajes directos
                </p>
                {dmChannels.map((ch) => {
                  const otherId = ch.members.find((id) => id !== userId);
                  const member = teamMembers.find((m) => m.user_id === otherId);
                  return (
                    <button
                      key={ch.channelId}
                      onClick={() => handleSelectChannel(ch.channelId)}
                      className={`flex items-center gap-2.5 w-full px-4 py-2 text-left transition-colors ${
                        activeChannelId === ch.channelId
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${getAvatarColor(otherId || '')}`}>
                        {member ? getInitials(member.fullName) : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member?.fullName || 'Usuario'}</p>
                        {ch.lastMessage && (
                          <p className="text-[11px] text-gray-400 truncate">{ch.lastMessage.text}</p>
                        )}
                      </div>
                      {ch.lastMessageAt && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {formatTime(ch.lastMessageAt)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {channels.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-400 text-center">
                  No hay conversaciones aún
                </p>
                <button
                  onClick={() => setShowNewChat(true)}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Iniciar una conversación
                </button>
              </div>
            )}
          </div>

          {/* Team members mini-list */}
          <div className="border-t border-gray-100 dark:border-gray-800 py-2 px-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Equipo ({teamMembers.length})
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {teamMembers.slice(0, 8).map((m) => (
                <div
                  key={m.user_id}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white cursor-pointer hover:scale-110 transition-transform ${getAvatarColor(m.user_id)}`}
                  title={m.fullName}
                  onClick={() => handleCreateDM(m.user_id)}
                >
                  {getInitials(m.fullName)}
                </div>
              ))}
              {teamMembers.length > 8 && (
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-500">
                  +{teamMembers.length - 8}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Main Chat Area ─── */}
        <div className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900 relative ${showMobileSidebar ? 'hidden lg:flex' : 'flex'}`}>
          {activeChannel ? (
            <>
              {/* Top bar */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowMobileSidebar(true)}
                    className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <MessageSquare className="w-5 h-5 text-gray-500" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">{getChannelIcon(activeChannel)}</span>
                    <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {getChannelDisplayName(activeChannel)}
                    </p>
                  </div>
                  {activeChannel.channelType === 'general' && (
                    <>
                      <div className="hidden sm:block h-4 w-px bg-gray-200 dark:bg-gray-700" />
                      <p className="hidden sm:block text-xs text-gray-400 dark:text-gray-500">
                        Canal del equipo · {teamMembers.length} miembro{teamMembers.length !== 1 ? 's' : ''}
                      </p>
                    </>
                  )}
                  {activeChannel.channelType === 'group' && (
                    <>
                      <div className="hidden sm:block h-4 w-px bg-gray-200 dark:bg-gray-700" />
                      <p className="hidden sm:block text-xs text-gray-400 dark:text-gray-500">
                        {activeChannel.members.length} miembro{activeChannel.members.length !== 1 ? 's' : ''}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowSearch(!showSearch)}
                    className={`p-2 rounded-lg transition-colors ${
                      showSearch
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Search bar */}
              {showSearch && (
                <div className="px-6 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar mensajes..."
                      className="w-full pl-9 pr-8 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      autoFocus
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                        <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Messages area */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto py-4 scroll-smooth"
              >
                {loadingMessages ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-gray-400">Cargando conversación...</p>
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl flex items-center justify-center">
                      <MessageSquare className="w-10 h-10 text-blue-500" />
                    </div>
                    <div className="text-center max-w-sm">
                      <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                        {searchQuery ? 'Sin resultados' : 'Comienza la conversación'}
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        {searchQuery
                          ? `No se encontraron mensajes con "${searchQuery}"`
                          : `Escribe el primer mensaje en ${getChannelDisplayName(activeChannel)}`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {filteredMessages.map((msg, i) => {
                      const showDate = shouldShowDateSeparator(filteredMessages, i);
                      const showAv = shouldShowAvatar(filteredMessages, i);
                      return (
                        <div key={msg.messageId}>
                          {showDate && (
                            <div className="flex items-center gap-3 px-6 my-5">
                              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                              <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 px-2">
                                {formatDateSeparator(msg.createdAt)}
                              </span>
                              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                            </div>
                          )}
                          <MessageRow
                            message={msg}
                            isOwn={msg.userId === userId}
                            showAvatar={showAv || showDate}
                            userId={userId}
                            onReply={(m) => {
                              setReplyTo(m);
                              setEditingMessage(null);
                              inputRef.current?.focus();
                            }}
                            onReact={handleReact}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            allMessages={filteredMessages}
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
                <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10">
                  <button
                    onClick={() => scrollToBottom()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-900/80 dark:bg-gray-100/80 backdrop-blur-sm text-white dark:text-gray-900 rounded-full text-xs font-semibold shadow-xl hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Nuevos mensajes
                  </button>
                </div>
              )}

              {/* Editing bar */}
              {editingMessage && (
                <div className="flex items-center gap-3 px-6 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800 flex-shrink-0">
                  <Pencil className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Editando mensaje</p>
                    <p className="text-xs text-amber-600/70 dark:text-amber-400/50 truncate">{editingMessage.text}</p>
                  </div>
                  <button
                    onClick={() => { setEditingMessage(null); setInputText(''); }}
                    className="p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-800/50 transition-colors"
                  >
                    <X className="w-4 h-4 text-amber-600" />
                  </button>
                </div>
              )}

              {/* Reply bar */}
              {replyTo && !editingMessage && (
                <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-800 flex-shrink-0">
                  <Reply className="w-4 h-4 text-blue-500 flex-shrink-0 rotate-180" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{replyTo.userName}</p>
                    <p className="text-xs text-blue-500/70 dark:text-blue-400/50 truncate">{replyTo.text}</p>
                  </div>
                  <button
                    onClick={() => setReplyTo(null)}
                    className="p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors"
                  >
                    <X className="w-4 h-4 text-blue-500" />
                  </button>
                </div>
              )}

              {/* Input area */}
              <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-end gap-3">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        editingMessage
                          ? 'Edita tu mensaje...'
                          : `Escribe un mensaje en ${getChannelDisplayName(activeChannel)}...`
                      }
                      rows={1}
                      className={`w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:ring-2 transition-all max-h-[120px] ${
                        editingMessage
                          ? 'border-amber-300 dark:border-amber-600 focus:ring-amber-500/40'
                          : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500/40'
                      } focus:border-transparent`}
                      style={{ minHeight: '46px' }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = '46px';
                        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending}
                    className={`flex-shrink-0 w-11 h-11 text-white rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:scale-100 shadow-sm ${
                      editingMessage
                        ? 'bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 dark:disabled:bg-gray-700'
                        : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700'
                    }`}
                  >
                    {sending ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : editingMessage ? (
                      <Check className="w-4.5 h-4.5" />
                    ) : (
                      <Send className="w-4.5 h-4.5" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 ml-1">
                  <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-mono">Enter</kbd> para enviar · <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-mono">Shift+Enter</kbd> nueva línea
                  {editingMessage && (
                    <> · <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[9px] font-mono">Esc</kbd> cancelar edición</>
                  )}
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm px-8">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-10 h-10 text-blue-500" />
                </div>
                <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                  Selecciona una conversación
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                  Elige un canal o mensaje directo de la barra lateral, o crea una nueva conversación.
                </p>
                <button
                  onClick={() => { setShowNewChat(true); setShowMobileSidebar(true); }}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Nueva conversación
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      <NewChatModal
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        onCreateDM={(memberId) => {
          handleCreateDM(memberId);
          setShowNewChat(false);
        }}
        onCreateGroup={handleCreateGroup}
        members={teamMembers}
        userId={userId}
      />
    </Layout>
  );
}
