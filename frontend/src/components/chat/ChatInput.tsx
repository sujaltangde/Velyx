import { useState, useRef, KeyboardEvent, useEffect } from 'react'
import { IoSend } from 'react-icons/io5'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean
}

function ChatInput({ onSendMessage, disabled = false }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Always keep focus on textarea
  const focusTextarea = () => {
    textareaRef.current?.focus()
  }

  // Auto-focus textarea on component mount
  useEffect(() => {
    focusTextarea()
  }, [])

  // Refocus when disabled changes (after AI response)
  useEffect(() => {
    if (!disabled) {
      focusTextarea()
    }
  }, [disabled])

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage('')
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Only submit if not disabled (loading)
      if (!disabled) {
        handleSubmit()
      }
    }
  }

  const handleInput = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }

  return (
    <div className="border-t border-gray-700 bg-gray-900 p-4" onClick={focusTextarea}>
      <div className="max-w-4xl mx-auto">
        <div className="relative flex items-end gap-3 bg-gray-800 p-3 border border-gray-700" onClick={focusTextarea}>
          {/* Textarea - always enabled, only send button gets disabled */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Message..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none outline-none max-h-[200px] min-h-[24px]"
            rows={1}
          />

          {/* Send Button */}
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || disabled}
            className="shrink-0 px-4 py-2 bg-purple-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center cursor-pointer"
          >
            {disabled ? (
              <span>...</span>
            ) : (
              <IoSend className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Helper Text */}
        <div className="mt-2 text-center text-xs text-gray-500">
          Press Enter to send, Shift + Enter for new line
        </div>
      </div>
    </div>
  )
}

export default ChatInput

