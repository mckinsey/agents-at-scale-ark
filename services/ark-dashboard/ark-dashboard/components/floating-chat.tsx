"use client"

import { useState, useEffect, useRef } from "react"
import { Send, X, AlertCircle, Expand, Shrink, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { chatService } from "@/lib/services"
import { ChatMessage } from "@/components/chat/chat-message"
import type { ChatMessageData } from "@/lib/types/chat"

type ChatType = "model" | "team" | "agent"

interface FloatingChatProps {
  id: string
  name: string
  type: ChatType
  position: number
  onClose: () => void
}


export default function FloatingChat({ name, type, position, onClose }: FloatingChatProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([])
  const [currentMessage, setCurrentMessage] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [viewMode, setViewMode] = useState<'text' | 'markdown'>('markdown')
  const [sessionId] = useState(() => `session-${Date.now()}`)
  const inputRef = useRef<HTMLInputElement>(null)
  const stopPollingRef = useRef<(() => void) | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }


  useEffect(() => {
    // Focus input when chat opens
    setTimeout(() => inputRef.current?.focus(), 100)
    
    // Cleanup: stop polling when component unmounts
    return () => {
      if (stopPollingRef.current) {
        stopPollingRef.current()
      }
    }
  }, [])

  useEffect(() => {
    // Focus input when processing completes
    if (!isProcessing) {
      inputRef.current?.focus()
    }
  }, [isProcessing])

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(scrollToBottom, 100)
  }, [chatMessages])

  const pollQueryStatus = async (queryName: string) => {
    let pollingStopped = false
    stopPollingRef.current = () => { pollingStopped = true }
    
    while (!pollingStopped) {
      try {
        const result = await chatService.getQueryResult(queryName)

        // Check if terminal state with response
        if (result.terminal) {
          // Add assistant message with the result
          const assistantMessage: ChatMessageData = {
            role: "assistant",
            content: "",
            queryName: queryName,
            status: "completed"
          }
          
          if (result.status === 'done' && result.response) {
            assistantMessage.content = result.response
            assistantMessage.status = "completed"
          } else if (result.status === 'error') {
            assistantMessage.content = result.response || 'Query failed'
            assistantMessage.status = "failed"
          } else if (result.status === 'unknown') {
            assistantMessage.content = 'Query status unknown'
            assistantMessage.status = "failed"
          }
          
          setChatMessages((prev) => [...prev, assistantMessage])
          
          pollingStopped = true
          break
        }
      } catch (error) {
        console.error('Error polling query status:', error)
        
        // Add error message
        const errorMessage: ChatMessageData = {
          role: "assistant",
          content: "Error while processing query",
          queryName: queryName,
          status: "failed"
        }
        setChatMessages((prev) => [...prev, errorMessage])
        
        pollingStopped = true
      }
      
      if (!pollingStopped) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  const buildChatHistory = (messages: ChatMessageData[], currentMsg: string): string => {
    const history = messages
      .filter(msg => msg.content) // Only include messages with content
      .map(msg => {
        const prefix = msg.role === "user" ? "User" : "Agent"
        return `${prefix}: ${msg.content}`
      })
      .join("\n\n")
    
    // Add the current message
    const fullQuery = history ? `${history}\n\nUser: ${currentMsg}` : `User: ${currentMsg}`
    return fullQuery
  }

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isProcessing) return

    const userMessage = currentMessage.trim()
    setCurrentMessage("")
    setError(null)

    // Add user message
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }])

    // Keep focus on input
    inputRef.current?.focus()

    setIsProcessing(true)

    try {
      // Build the full query with chat history
      const fullQuery = buildChatHistory(chatMessages, userMessage)
      
      // Submit the query with history
      const query = await chatService.submitChatQuery(
        fullQuery,
        type,
        name,
        sessionId
      )

      // Poll for query status updates
      await pollQueryStatus(query.name)
      
    } catch (err) {
      console.error('Error sending message:', err)
      let errorMessage = 'Failed to send message'
      
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the ARK API. Please ensure the backend service is running on port 8000.'
        } else {
          errorMessage = err.message
        }
      }
      
      setError(errorMessage)
      setIsProcessing(false)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Calculate position - each window is 420px wide (400px + 20px gap)
  const rightPosition = 16 + (position * 420)

  // Handle maximize/minimize styling
  const cardStyles = isMaximized 
    ? "fixed inset-4 shadow-2xl z-50 transition-all duration-300"
    : "fixed bottom-4 shadow-2xl z-50 w-[400px] h-[500px] transition-all duration-300"

  return (
    <Card 
      className={`${cardStyles} p-0`}
      style={isMaximized ? {} : { right: `${rightPosition}px` }}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Dialog-style Header */}
        <div className="flex-shrink-0 border-b">
          {/* Title Row */}
          <div className="flex items-center justify-between px-3 py-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">
                      {name}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMaximized(!isMaximized)}
                className="h-6 w-6 p-0"
                title={isMaximized ? 'Minimize chat' : 'Maximize chat'}
              >
                {isMaximized ? <Shrink className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-6 w-6 p-0"
                title="Close chat"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          
          <Separator />
          
          {/* Controls Row */}
          <div className="flex justify-end px-3 py-1.5">
            <div className="flex items-center gap-1 text-xs">
              <button 
                className={`px-2 py-1 rounded transition-colors ${
                  viewMode === 'text' 
                    ? 'bg-secondary text-secondary-foreground font-medium' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => setViewMode('text')}
              >
                Text
              </button>
              <button 
                className={`px-2 py-1 rounded transition-colors ${
                  viewMode === 'markdown' 
                    ? 'bg-secondary text-secondary-foreground font-medium' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => setViewMode('markdown')}
              >
                Markdown
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
          <div className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            {chatMessages.length === 0 && !error && (
              <div className="text-center text-muted-foreground py-8">
                Start a conversation with the {type}
              </div>
            )}

            {chatMessages.map((message, index) => (
              message.content ? (
                <ChatMessage
                  key={index}
                  role={message.role}
                  content={message.content}
                  status={message.status}
                  viewMode={viewMode}
                  queryName={message.queryName}
                />
              ) : null
            ))}
            
            {/* Show typing indicator when processing */}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-3 py-2 bg-muted">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t flex-shrink-0">
          <Input
            ref={inputRef}
            placeholder={isProcessing ? "Processing..." : "Type your message..."}
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isProcessing}
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={!currentMessage.trim() || isProcessing} 
            size="sm" 
            variant="default"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}