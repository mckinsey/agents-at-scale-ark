import React, { ReactNode, useCallback, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Trash, MoreVerticalIcon } from "lucide-react";
import { useDeleteQueryMemory, useDeleteSessionMemory, useResetMemory } from '@/lib/services/memory-hooks';

type DeleteConfirmationType = 'session' | 'query' | 'reset' | null

type Query = {
  sessionId: string;
  queryId: string;
}

type DeleteQueryConfirmationDialogProps = {
  onSuccess?: () => void
  query?: Query
}

function DeleteQueryConfirmationDialog({ query, onSuccess }: DeleteQueryConfirmationDialogProps) {
  const deleteQueryMemory = useDeleteQueryMemory()

  const handleConfirmation = async () => {
    if (query) {
      deleteQueryMemory.mutate(query, {
        onSuccess
      })
    }
  }

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone.
          <br />
          This will <span className='font-bold'>permanently delete </span>
          Query: <span className='font-bold'>{query?.queryId}</span> from Memory.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <Button variant="destructive" asChild>
          <AlertDialogAction onClick={handleConfirmation}>
            Delete Query
          </AlertDialogAction>
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

type DeleteSessionConfirmationDialogProps = {
  onSuccess?: () => void
  sessionId?: string | null
}

function DeleteSessionConfirmationDialog({ onSuccess, sessionId }: DeleteSessionConfirmationDialogProps) {
  const deleteSessionMemory = useDeleteSessionMemory()

  const handleConfirmation = async () => {
    if (sessionId) {
      deleteSessionMemory.mutate(sessionId, {
        onSuccess
      })
    }
  }

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone.
          <br />
          This will <span className='font-bold'>permanently delete </span>
          Session: <span className='font-bold'>{sessionId}</span> from Memory.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <Button variant="destructive" asChild>
          <AlertDialogAction onClick={handleConfirmation}>
            Delete Session
          </AlertDialogAction>
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

type ResetMemoryConfirmationDialogProps = {
  onSuccess?: () => void
}

function ResetMemoryConfirmationDialog({ onSuccess }: ResetMemoryConfirmationDialogProps) {
  const resetMemory = useResetMemory()

  const handleConfirmation = async () => {
    resetMemory.mutate(undefined, {
      onSuccess
    })
  }

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will <span className='font-bold'>permanently</span> reset Memory.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <Button variant="destructive" asChild>
          <AlertDialogAction onClick={handleConfirmation}>Reset Memory</AlertDialogAction>
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

type DeleteMemoryDropdownMenuProps = {
  className?: string
  selectedQuery?: Query
  selectedSession?: string | null
  onSuccess?: () => void
}

export function DeleteMemoryDropdownMenu({
  className,
  selectedQuery,
  selectedSession,
  onSuccess
}: DeleteMemoryDropdownMenuProps) {
  const [deleteConfirmationDialogToRender, setDeleteConfirmationDialogToRender] = useState<DeleteConfirmationType>(null)

  const renderConfirmationDialogs = useCallback((): ReactNode => {
    switch (deleteConfirmationDialogToRender) {
      case 'query':
        return (<DeleteQueryConfirmationDialog query={selectedQuery} onSuccess={onSuccess} />)
      case 'session':
        return (<DeleteSessionConfirmationDialog sessionId={selectedSession} onSuccess={onSuccess} />)
      case 'reset':
        return (<ResetMemoryConfirmationDialog onSuccess={onSuccess} />)
      default:
        return null
    }
  }, [deleteConfirmationDialogToRender, onSuccess, selectedQuery, selectedSession])

  const onSelectHandlerFactory = useCallback((type: DeleteConfirmationType) => {
    return () => setDeleteConfirmationDialogToRender(type)
  }, [])

  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className={className}>
          <Button variant="outline">
            <Trash className="w-4 h-4" />
            Delete Records
            <MoreVerticalIcon className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              disabled={!selectedQuery}
              onSelect={onSelectHandlerFactory('query')}
            >
              <Trash className="w-4 h-4 text-muted-foreground" />
              <div className="min-w-0">
                <div>Delete selected Query</div>
                <span className="block text-xs text-muted-foreground truncate">
                  {selectedQuery?.queryId}
                </span>
              </div>
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              disabled={!selectedSession}
              onSelect={onSelectHandlerFactory('session')}
            >
              <Trash className="w-4 h-4" />
              <div className="min-w-0">
                <div>Delete selected Session</div>
                <span className="block text-xs text-muted-foreground truncate">
                  {selectedSession}
                </span>
              </div>
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem onSelect={onSelectHandlerFactory('reset')}>
              <Trash className="w-4 h-4" />
              Reset Memory
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
      {
        renderConfirmationDialogs()
      }
    </AlertDialog>
  )
}