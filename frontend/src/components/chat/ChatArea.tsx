import { useEffect, useRef } from 'react'
import { IoBulbOutline, IoSearchOutline, IoCreateOutline, IoHelpCircleOutline } from 'react-icons/io5'
import ChatMessage from './ChatMessage'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: string
  isStreaming?: boolean
}

interface ChatAreaProps {
  messages: Message[]
  isLoading?: boolean
}

function ChatArea({ messages, isLoading = false }: ChatAreaProps) {
  // Check if there's currently a streaming message
  const hasStreamingMessage = messages.some((msg) => msg.isStreaming)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.length === 0 ? (
        // Empty State
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center max-w-2xl">
            <div className="w-20 h-16  flex items-center justify-center mx-auto mb-6">
              {/* <IoChatbubbleEllipsesOutline className="w-8 h-8 text-white" /> */}
              <img src="/media/logo.png" alt="Velyx" className="h-8" />
              <span className="text-white text-2xl font-bold px-2">
              Velyx
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">
              Start a conversation
            </h2>
            <p className="text-gray-400 mb-8">
              Ask me anything! I'm here to help you with your questions.
            </p>
            
            {/* Suggested Questions */}
            <div className="grid md:grid-cols-2 gap-3 max-w-xl mx-auto">
              <button className="p-4 bg-gray-800 border border-gray-700 text-left hover:bg-gray-750 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <IoBulbOutline className="w-6 h-6 text-purple-400" />
                  <div>
                    <h3 className="text-white font-medium mb-1">
                      Get started
                    </h3>
                    <p className="text-sm text-gray-400">
                      Learn what I can do
                    </p>
                  </div>
                </div>
              </button>
              
              <button className="p-4 bg-gray-800 border border-gray-700 text-left hover:bg-gray-750 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <IoSearchOutline className="w-6 h-6 text-purple-400" />
                  <div>
                    <h3 className="text-white font-medium mb-1">
                      Ask a question
                    </h3>
                    <p className="text-sm text-gray-400">
                      Get instant answers
                    </p>
                  </div>
                </div>
              </button>
              
              <button className="p-4 bg-gray-800 border border-gray-700 text-left hover:bg-gray-750 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <IoCreateOutline className="w-6 h-6 text-purple-400" />
                  <div>
                    <h3 className="text-white font-medium mb-1">
                      Create content
                    </h3>
                    <p className="text-sm text-gray-400">
                      Generate text & ideas
                    </p>
                  </div>
                </div>
              </button>
              
              <button className="p-4 bg-gray-800 border border-gray-700 text-left hover:bg-gray-750 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <IoHelpCircleOutline className="w-6 h-6 text-purple-400" />
                  <div>
                    <h3 className="text-white font-medium mb-1">
                      Get help
                    </h3>
                    <p className="text-sm text-gray-400">
                      Solve problems quickly
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Messages
        <div className="max-w-4xl mx-auto">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          
          {/* Loading State - only show when waiting for stream to start */}
          {isLoading && !hasStreamingMessage && (
            <div className="flex p-4 justify-start">
              <div className="flex gap-3 max-w-[80%] flex-row">
                <div className="shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold text-sm">
                    AI
                  </div>
                </div>
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-400">Assistant</span>
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-gray-700 text-gray-200">
                    <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  )
}

export default ChatArea

