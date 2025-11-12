import React, { ReactNode, useCallback, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Trash, MoreVerticalIcon } from "lucide-react";

type DeleteConfirmationType = 'session' | 'query' | 'reset' | null

function DeleteQueryConfirmationDialog() {
  return (<AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your
        account and remove your data from our servers.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction>Continue</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>)
}
function DeleteSessionConfirmationDialog() {
  return (<AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your
        account and remove your data from our servers.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction>Continue</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>)
}
function ResetMemoryConfirmationDialog() {
  return (<AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your
        account and remove your data from our servers.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction>Continue</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>)
}

type DeleteMemoryDropdownMenuProps = {
  className?: string
  selectedQuery?: string | null
  selectedSession?: string | null
}

export function DeleteMemoryDropdownMenu({ className, selectedQuery, selectedSession }: DeleteMemoryDropdownMenuProps) {
  const [deleteConfirmationDialogToRender, setDeleteConfirmationDialogToRender] = useState<DeleteConfirmationType>(null)

  const renderConfirmationDialogs = useCallback((): ReactNode => {
    switch (deleteConfirmationDialogToRender) {
      case 'query':
        return (<DeleteQueryConfirmationDialog />)
      case 'session':
        return (<DeleteSessionConfirmationDialog />)
      case 'reset':
        return (<ResetMemoryConfirmationDialog />)
      default:
        return null
    }
  }, [deleteConfirmationDialogToRender])

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
                  {selectedQuery}
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