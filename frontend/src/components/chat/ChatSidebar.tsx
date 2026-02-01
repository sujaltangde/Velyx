import { useState, useEffect } from 'react'
import { IoAdd, IoChevronBack, IoChevronForward, IoChatbubbleEllipsesOutline, IoTrashOutline } from 'react-icons/io5'
import { chatAPI, type Chat } from '../../api/chat'
import { toast } from 'react-toastify'
import moment from 'moment'
import { useAppSelector } from '../../store/hooks'

interface ChatSidebarProps {
  selectedChatId: string | null
  onSelectChat: (chatId: string) => void
  onNewChat: () => void
  refreshTrigger?: number
}

function ChatSidebar({ selectedChatId, onSelectChat, onNewChat, refreshTrigger }: ChatSidebarProps) {
  const user = useAppSelector((state) => state.auth.user)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [chats, setChats] = useState<Chat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)

  // Fetch chats from the API
  useEffect(() => {
    const fetchChats = async () => {
      try {
        setIsLoading(true)
        const response = await chatAPI.getChats()
        setChats(response.chats)
      } catch (error) {
        console.error('Failed to fetch chats:', error)
        toast.error('Failed to load chat history')
      } finally {
        setIsLoading(false)
      }
    }

    fetchChats()
  }, [refreshTrigger])

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    
    try {
      setDeletingChatId(chatId)
      await chatAPI.deleteChat(chatId)
      setChats((prev) => prev.filter((chat) => chat.id !== chatId))
      
      // If the deleted chat was selected, clear selection
      if (selectedChatId === chatId) {
        onNewChat()
      }
      
      toast.success('Chat deleted')
    } catch (error) {
      console.error('Failed to delete chat:', error)
      toast.error('Failed to delete chat')
    } finally {
      setDeletingChatId(null)
    }
  }

  const formatTimestamp = (dateString: string) => {
    const date = moment(dateString)
    const now = moment()
    
    if (date.isSame(now, 'day')) {
      return date.format('h:mm A')
    } else if (date.isSame(now.subtract(1, 'day'), 'day')) {
      return 'Yesterday'
    } else if (date.isSame(now, 'week')) {
      return date.format('dddd')
    } else {
      return date.format('MMM D')
    }
  }

  return (
    <div
      className={`bg-gray-900 border-r border-gray-700 flex flex-col transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-72'
      }`}
    >
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        {!isCollapsed && (
          <h2 className="text-white font-semibold text-lg">Chats</h2>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-gray-400 p-2 hover:text-white transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <IoChevronForward className="w-5 h-5" />
          ) : (
            <IoChevronBack className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className={`w-full bg-purple-600 text-sm text-white font-semibold flex items-center justify-center gap-2 cursor-pointer ${
            isCollapsed ? 'py-1 px-2' : 'py-1.5 px-4'
          }`}
        >
          <IoAdd className={isCollapsed ? 'w-6 h-6' : 'w-5 h-5'} />
          {!isCollapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {!isCollapsed && "No chats yet. Start a new conversation!"}
          </div>
        ) : !isCollapsed ? (
          <div className="space-y-1 p-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`w-full text-left p-3 transition-colors cursor-pointer group relative ${
                  selectedChatId === chat.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-medium text-sm truncate flex-1 pr-2">
                    {chat.title}
                  </h3>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 group-hover:hidden">
                      {formatTimestamp(chat.updatedAt)}
                    </span>
                    <button
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      className="hidden group-hover:block text-gray-500 hover:text-red-500 transition-colors p-1"
                      title="Delete chat"
                      disabled={deletingChatId === chat.id}
                    >
                      {deletingChatId === chat.id ? (
                        <div className="w-4 h-4 border-2 border-gray-500 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <IoTrashOutline className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 truncate">{chat.preview}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`w-full p-3 transition-colors cursor-pointer ${
                  selectedChatId === chat.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
                title={chat.title}
              >
                <IoChatbubbleEllipsesOutline className="w-5 h-5 mx-auto" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User Section at Bottom */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
              {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">
                {user?.name || user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email || 'Online'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatSidebar

