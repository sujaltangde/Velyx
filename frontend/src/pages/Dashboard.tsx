import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { logout } from "../store/authSlice";
import ChatSidebar from "../components/chat/ChatSidebar";
import ChatArea from "../components/chat/ChatArea";
import ChatInput from "../components/chat/ChatInput";
import moment from "moment";
import { IoLogOut } from "react-icons/io5";
import { IoClose } from "react-icons/io5";
import { socketService, type Citation } from "../services/socket";
import { IoMdAdd, IoMdCheckmark } from "react-icons/io";
import { v4 as uuidv4 } from "uuid";
import { oauthAPI } from "../api/oauth";
import { chatAPI } from "../api/chat";

type DisconnectPopupType = "gmail" | "notion" | "hubspot" | null;

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  isStreaming?: boolean;
  citations?: Citation[];
}

function Dashboard() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { chatId: urlChatId } = useParams<{ chatId?: string }>();
  const user = useAppSelector((state) => state.auth.user);

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [conversationId, setConversationId] = useState<string>(uuidv4());
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isNotionConnected, setIsNotionConnected] = useState(false);
  const [isHubspotConnected, setIsHubspotConnected] = useState(false);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [disconnectPopup, setDisconnectPopup] =
    useState<DisconnectPopupType>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // Ref to track current streaming message
  const streamingMessageRef = useRef<string | null>(null);
  // Ref to track if this is the first message (new chat creation)
  const isNewChatRef = useRef<boolean>(false);
  // Ref to track current conversation ID for socket handlers
  const conversationIdRef = useRef<string>(conversationId);

  // Keep conversationIdRef in sync with conversationId state
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Load chat from URL param on mount, or set initial chat ID in URL
  useEffect(() => {
    if (urlChatId) {
      handleSelectChat(urlChatId);
    } else {
      // No chat ID in URL, set the initial conversation ID in URL
      setSelectedChatId(conversationId);
      isNewChatRef.current = true;
      navigate(`/dashboard/${conversationId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch OAuth connection status
  useEffect(() => {
    const fetchConnectionStatus = async () => {
      try {
        setIsLoadingConnections(true);
        const response = await oauthAPI.getConnectionStatus();
        setIsGoogleConnected(response.data.google);
        setIsNotionConnected(response.data.notion);
        setIsHubspotConnected(response.data.hubspot);
      } catch (error) {
        console.error("Failed to fetch connection status:", error);
        toast.error("Failed to fetch connection status");
      } finally {
        setIsLoadingConnections(false);
      }
    };

    fetchConnectionStatus();
  }, []);

  // Initialize Socket.IO connection with streaming support
  useEffect(() => {
    if (user?.id) {
      // Register connect callback first (before connect)
      socketService.onConnect(() => {
        setIsSocketConnected(true);
      });

      socketService.connect(user.id);

      socketService.onChatJoined(() => {
        // Also set on chat-joined as backup
        setIsSocketConnected(true);
      });

      // Handle stream start - create placeholder message
      socketService.onStreamStart((data) => {
        streamingMessageRef.current = data.id;
        const newMessage: Message = {
          id: data.id,
          content: "",
          role: "assistant",
          timestamp: moment(data.timestamp).format("h:mm A"),
          isStreaming: true,
        };
        setMessages((prev) => [...prev, newMessage]);
      });

      // Handle stream chunks - update message content
      socketService.onStreamChunk((data) => {
        if (streamingMessageRef.current === data.id) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === data.id
                ? { ...msg, content: msg.content + data.token }
                : msg,
            ),
          );
        }
      });

      // Handle stream end - finalize message with citations
      socketService.onStreamEnd((data) => {
        if (streamingMessageRef.current === data.id) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === data.id
                ? { ...msg, isStreaming: false, citations: data.citations }
                : msg,
            ),
          );
          streamingMessageRef.current = null;
          setIsLoading(false);

          // Only refresh sidebar and update URL when a new chat was created (first message)
          if (isNewChatRef.current) {
            const newChatId = conversationIdRef.current;
            setSidebarRefreshTrigger((prev) => prev + 1);
            setSelectedChatId(newChatId); // Set the selected chat ID
            navigate(`/dashboard/${newChatId}`, { replace: true }); // Update URL with new chat ID
            isNewChatRef.current = false; // Reset after refresh
          }
        }
      });

      // Handle stream error
      socketService.onStreamError((message) => {
        const errorMessage: Message = {
          id: message.id,
          content: message.content,
          role: "assistant",
          timestamp: moment(message.timestamp).format("h:mm A"),
        };
        setMessages((prev) => [...prev, errorMessage]);
        streamingMessageRef.current = null;
        setIsLoading(false);
      });

      // Legacy handler (fallback)
      socketService.onReceiveMessage((message) => {
        const formattedMessage: Message = {
          id: message.id,
          content: message.content,
          role: message.role,
          timestamp: moment(message.timestamp).format("h:mm A"),
        };
        setMessages((prev) => [...prev, formattedMessage]);
        setIsLoading(false);
      });

      return () => {
        socketService.offReceiveMessage();
        socketService.offChatJoined();
        socketService.offStreamEvents();
        socketService.disconnect();
      };
    }
  }, [user?.id]);

  const handleLogout = () => {
    dispatch(logout());
    toast.success("Logged out successfully!");
    navigate("/login");
  };

  const handleNewChat = () => {
    setMessages([]);
    const newConversationId = uuidv4();
    setConversationId(newConversationId);
    setSelectedChatId(newConversationId); // Set the new chat ID as selected
    isNewChatRef.current = true; // Mark as new chat for sidebar refresh
    navigate(`/dashboard/${newConversationId}`, { replace: true }); // Show new chat ID in URL
  };

  const handleSelectChat = async (chatId: string) => {
    if (chatId === selectedChatId) return;

    setSelectedChatId(chatId);
    setIsLoadingChat(true);
    navigate(`/dashboard/${chatId}`, { replace: true }); // Update URL with chat ID

    try {
      const response = await chatAPI.getChat(chatId);
      const formattedMessages: Message[] = response.messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        timestamp: moment(msg.createdAt).format("h:mm A"),
        citations: msg.citations || undefined,
      }));
      setMessages(formattedMessages);
      setConversationId(chatId); // Use the chat ID as the conversation ID
      isNewChatRef.current = false; // Existing chat, no sidebar refresh needed
    } catch (error: any) {
      // If chat not found (404), treat it as a new chat
      if (error?.response?.status === 404) {
        setMessages([]);
        setConversationId(chatId);
        isNewChatRef.current = true; // Mark as new chat for sidebar refresh
      } else {
        console.error("Failed to load chat:", error);
        toast.error("Failed to load chat messages");
        // Generate a new chat ID and redirect
        const newChatId = uuidv4();
        setMessages([]);
        setConversationId(newChatId);
        setSelectedChatId(newChatId);
        isNewChatRef.current = true;
        navigate(`/dashboard/${newChatId}`, { replace: true });
      }
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!isSocketConnected) {
      toast.error("Not connected to chat server. Please refresh the page.");
      return;
    }

    if (!user?.id) {
      toast.error("User not authenticated");
      return;
    }

    // Add user message to state immediately (optimistic update)
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      content: content,
      role: "user",
      timestamp: moment().format("h:mm A"),
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsLoading(true);

    // Send message through WebSocket with userId, message, and conversationId
    socketService.sendMessage(content, user.id, conversationId);
  };

  const handleGoogleConnect = async () => {
    if (isGoogleConnected) {
      setDisconnectPopup("gmail");
      return;
    }

    try {
      const response = await oauthAPI.initiateGoogleOAuth();
      // Redirect to Google OAuth consent screen
      window.location.href = response.authUrl;
    } catch (error: any) {
      console.error("Failed to initiate Google OAuth:", error);
      const errorMessage =
        error.response?.data?.message ||
        "Failed to connect Google. Please try again.";
      toast.error(errorMessage);
    }
  };

  const handleNotionConnect = async () => {
    if (isNotionConnected) {
      setDisconnectPopup("notion");
      return;
    }

    try {
      const response = await oauthAPI.initiateNotionOAuth();
      // Redirect to Notion OAuth consent screen
      window.location.href = response.authUrl;
    } catch (error: any) {
      console.error("Failed to initiate Notion OAuth:", error);
      const errorMessage =
        error.response?.data?.message ||
        "Failed to connect Notion. Please try again.";
      toast.error(errorMessage);
    }
  };

  const handleHubspotConnect = async () => {
    if (isHubspotConnected) {
      setDisconnectPopup("hubspot");
      return;
    }

    try {
      const response = await oauthAPI.initiateHubspotOAuth();
      // Redirect to HubSpot OAuth consent screen
      window.location.href = response.authUrl;
    } catch (error: any) {
      console.error("Failed to initiate HubSpot OAuth:", error);
      const errorMessage =
        error.response?.data?.message ||
        "Failed to connect HubSpot. Please try again.";
      toast.error(errorMessage);
    }
  };

  const handleDisconnect = async (type: DisconnectPopupType) => {
    if (!type) return;

    setIsDisconnecting(true);
    try {
      switch (type) {
        case "gmail":
          await oauthAPI.disconnectGoogle();
          setIsGoogleConnected(false);
          toast.success("Gmail disconnected successfully");
          break;
        case "notion":
          await oauthAPI.disconnectNotion();
          setIsNotionConnected(false);
          toast.success("Notion disconnected successfully");
          break;
        case "hubspot":
          await oauthAPI.disconnectHubspot();
          setIsHubspotConnected(false);
          toast.success("HubSpot disconnected successfully");
          break;
      }
      setDisconnectPopup(null);
    } catch (error: any) {
      console.error(`Failed to disconnect ${type}:`, error);
      const errorMessage =
        error.response?.data?.message ||
        `Failed to disconnect ${type}. Please try again.`;
      toast.error(errorMessage);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const getPopupConfig = (type: DisconnectPopupType) => {
    switch (type) {
      case "gmail":
        return {
          title: "Disconnect Gmail",
          message:
            "Are you sure you want to disconnect Gmail? This will remove all your synced email data.",
          icon: "/media/gmail.webp",
          iconSize: "w-10 h-10",
        };
      case "notion":
        return {
          title: "Disconnect Notion",
          message:
            "Are you sure you want to disconnect Notion? This will remove all your synced Notion pages data.",
          icon: "/media/notion.webp",
          iconSize: "w-8 h-8",
        };
      case "hubspot":
        return {
          title: "Disconnect HubSpot",
          message:
            "Are you sure you want to disconnect HubSpot? This will remove your HubSpot connection.",
          icon: "/media/hubspot.webp",
          iconSize: "w-8 h-8",
        };
      default:
        return null;
    }
  };

  const popupConfig = getPopupConfig(disconnectPopup);

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Disconnect Confirmation Popup */}
      {disconnectPopup && popupConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <img
                  src={popupConfig.icon}
                  className={popupConfig.iconSize}
                  alt=""
                />
                <h3 className="text-lg font-semibold text-white">
                  {popupConfig.title}
                </h3>
              </div>
              <button
                onClick={() => setDisconnectPopup(null)}
                className="text-gray-400 hover:text-white transition-colors"
                disabled={isDisconnecting}
              >
                <IoClose size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              <p className="text-gray-300 text-sm">{popupConfig.message}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700">
              <button
                onClick={() => setDisconnectPopup(null)}
                disabled={isDisconnecting}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDisconnect(disconnectPopup)}
                disabled={isDisconnecting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDisconnecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  "Disconnect"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-16 h-8 ml-3 text-lg font-semibold text-white flex items-center justify-center">
                {/* <IoChatbubbleEllipsesOutline className="w-5 h-5 text-white" /> */}
                <img src="/media/logo.png" alt="Velyx" className="h-6" />
                <span className="px-1">Velyx</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-4 text-white  ">
                <div
                  onClick={handleGoogleConnect}
                  className="flex cursor-pointer items-center py-0 px-3 border border-dashed border-gray-500 gap-1 hover:border-gray-400 transition-colors"
                >
                  {isLoadingConnections ? (
                    <div className="w-[18px] h-[18px] border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                  ) : isGoogleConnected ? (
                    <IoMdCheckmark size={18} className="text-green-500" />
                  ) : (
                    <IoMdAdd size={18} />
                  )}
                  <img src="/media/gmail.webp" className="w-8 h-8" alt="" />
                </div>
                <div
                  onClick={handleNotionConnect}
                  className="flex cursor-pointer items-center py-1 px-3 border border-dashed border-gray-500 gap-1 hover:border-gray-400 transition-colors"
                >
                  {isLoadingConnections ? (
                    <div className="w-[18px] h-[18px] border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                  ) : isNotionConnected ? (
                    <IoMdCheckmark size={18} className="text-green-500" />
                  ) : (
                    <IoMdAdd size={18} />
                  )}
                  <img src="/media/notion.webp" className="w-6 h-6" alt="" />
                </div>
                <div
                  onClick={handleHubspotConnect}
                  className="flex cursor-pointer items-center py-1 px-3 border border-dashed border-gray-500 gap-1 hover:border-gray-400 transition-colors"
                >
                  {isLoadingConnections ? (
                    <div className="w-[18px] h-[18px] border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                  ) : isHubspotConnected ? (
                    <IoMdCheckmark size={18} className="text-green-500" />
                  ) : (
                    <IoMdAdd size={18} />
                  )}
                  <img src="/media/hubspot.webp" className="w-6 h-6" alt="" />
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="bg-purple-600 text-white text-sm font-semibold py-2 px-2 flex items-center gap-2 cursor-pointer"
              >
                <IoLogOut size={18} />
                {/* <span>Logout</span> */}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content - Chat Interface */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <ChatSidebar
          selectedChatId={selectedChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          refreshTrigger={sidebarRefreshTrigger}
        />

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-gray-900">
          {isLoadingChat ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-gray-600 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : (
            <ChatArea messages={messages} isLoading={isLoading} />
          )}
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isLoading || isLoadingChat}
          />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
