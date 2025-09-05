"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Clock, AlertCircle, Play } from "lucide-react"

interface TimelineEvent {
  id: string
  timestamp: string
  title: string
  description?: string
  status: 'completed' | 'failed' | 'running' | 'pending' | 'warning'
  metadata?: Record<string, unknown>
}

interface TimelineComponentProps {
  title: string
  description?: string
  events: TimelineEvent[]
}

const getStatusConfig = (status: TimelineEvent['status']) => {
  switch (status) {
    case 'completed':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        borderColor: 'border-green-200'
      }
    case 'failed':
      return {
        icon: XCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        borderColor: 'border-red-200'
      }
    case 'running':
      return {
        icon: Play,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        borderColor: 'border-blue-200'
      }
    case 'warning':
      return {
        icon: AlertCircle,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        borderColor: 'border-yellow-200'
      }
    default:
      return {
        icon: Clock,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-200'
      }
  }
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleString()
  } catch {
    return timestamp
  }
}

export function TimelineComponent({ title, description, events }: TimelineComponentProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">No timeline events available</p>
        </CardContent>
      </Card>
    )
  }

  // Sort events by timestamp (newest first)
  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          
          {/* Timeline events */}
          <div className="space-y-4">
            {sortedEvents.map((event) => {
              const config = getStatusConfig(event.status)
              const Icon = config.icon
              
              return (
                <div key={event.id} className="relative flex items-start gap-4">
                  {/* Timeline marker */}
                  <div className={`
                    relative z-10 flex items-center justify-center 
                    w-8 h-8 rounded-full border-2 
                    ${config.bgColor} ${config.borderColor}
                  `}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  
                  {/* Event content */}
                  <div className="flex-1 min-w-0 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{event.title}</h4>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {event.description}
                          </p>
                        )}
                        
                        {/* Event metadata */}
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(event.metadata).map(([key, value]) => (
                              <div key={key} className="text-xs">
                                <span className="font-medium text-muted-foreground">
                                  {key.replace(/_/g, ' ')}:
                                </span>
                                <span className="ml-1 font-mono">
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-end gap-1 ml-4">
                        <Badge 
                          variant={event.status === 'completed' ? 'default' : 
                                  event.status === 'failed' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {event.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}