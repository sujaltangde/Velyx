import { IoCopy, IoRefresh } from "react-icons/io5";
import ReactMarkdown from "react-markdown";
import { toast } from "react-toastify";

interface Citation {
  tool: "notion" | "gmail" | "hubspot";
  title: string;
  subtitle?: string;
}

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  isStreaming?: boolean;
  citations?: Citation[];
}

interface ChatMessageProps {
  message: Message;
}

// Tool logo mapping
const toolLogos: Record<string, string> = {
  notion: "/media/notion.webp",
  gmail: "/media/gmail.webp",
  hubspot: "/media/hubspot.webp",
};

const toolNames: Record<string, string> = {
  notion: "Notion",
  gmail: "Gmail",
  hubspot: "HubSpot",
};

function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className={`flex p-4 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex gap-3 max-w-[80%] ${isUser ? "flex-row-reverse" : "flex-row"}`}
      >
        {/* Avatar */}
        <div className="shrink-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
              isUser ? "bg-purple-600 text-white" : "bg-gray-600 text-white"
            }`}
          >
            {isUser ? "U" : "AI"}
          </div>
        </div>

        {/* Message Content */}
        <div
          className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-400">
              {isUser ? "You" : "Assistant"}
            </span>
            <span className="text-xs text-gray-500">{message.timestamp}</span>
          </div>
          <div
            className={`px-4 py-3 rounded-2xl text-sm ${
              isUser
                ? "bg-purple-600 text-white rounded-tr-sm whitespace-pre-wrap"
                : "bg-gray-700 text-gray-200 rounded-tl-sm"
            }`}
          >
            {isUser ? (
              message.content
            ) : (
              <>
                {message.isStreaming && !message.content ? (
                  // Show pulsing cursor while waiting for AI response
                  <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse" />
                ) : (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-bold text-white">
                          {children}
                        </strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic">{children}</em>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside mb-2 space-y-1">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-inside mb-2 space-y-1">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="ml-2">{children}</li>
                      ),
                      code: ({ children }) => (
                        <code className="bg-gray-800 px-1.5 py-0.5 rounded text-purple-300 text-xs font-mono">
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className="bg-gray-800 p-3 rounded-lg overflow-x-auto my-2 text-xs">
                          {children}
                        </pre>
                      ),
                      h1: ({ children }) => (
                        <h1 className="text-lg font-bold mb-2 text-white">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-base font-bold mb-2 text-white">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-sm font-bold mb-1 text-white">
                          {children}
                        </h3>
                      ),
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:underline"
                        >
                          {children}
                        </a>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-purple-500 pl-3 italic text-gray-400 my-2">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                )}
              </>
            )}
          </div>

          {/* Citations */}
          {!isUser && message.citations && message.citations.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[10px] text-gray-500 font-medium">Sources:</p>
              <div className="flex flex-wrap gap-1.5">
                {message.citations.map((citation, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/50 rounded px-2 py-1 max-w-[180px]"
                  >
                    <img
                      src={toolLogos[citation.tool]}
                      alt={toolNames[citation.tool]}
                      className="w-3.5 h-3.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-300 font-medium truncate leading-tight">
                        {citation.title}
                      </p>
                      {citation.subtitle && (
                        <p className="text-[9px] text-gray-500 truncate leading-tight">
                          {citation.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default ChatMessage;
