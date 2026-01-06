'use client';

import { Bot, Boxes, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type AgentType = 'basic' | 'advanced' | 'skills';

interface AgentTypeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: AgentType) => void;
}

interface AgentTypeOption {
  id: AgentType;
  title: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
}

const AGENT_TYPE_OPTIONS: AgentTypeOption[] = [
  {
    id: 'basic',
    title: 'Basic Agent',
    description:
      'Build a simple agent using a prompt, model, and assign it tools. Runs natively using Ark.',
    icon: <Bot className="h-8 w-8" />,
    enabled: true,
  },
  {
    id: 'advanced',
    title: 'Advanced Agent (using a template implementation)',
    description:
      'Build an agent by deploying a template implementation, and configuring parameters.',
    icon: <Boxes className="h-8 w-8" />,
    enabled: true,
  },
  {
    id: 'skills',
    title: 'Skills-based Agent',
    description: 'Build an agent by providing it Skills.',
    icon: <Sparkles className="h-8 w-8" />,
    enabled: false,
  },
];

export function AgentTypeSelector({
  open,
  onOpenChange,
  onSelect,
}: AgentTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<AgentType | null>(null);

  const handleCreate = () => {
    if (selectedType) {
      onSelect(selectedType);
      setSelectedType(null);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedType(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>What kind of agent do you want to build?</DialogTitle>
          <DialogDescription>
            Choose the type of agent that best fits your needs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 py-6">
          {AGENT_TYPE_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              disabled={!option.enabled}
              onClick={() => option.enabled && setSelectedType(option.id)}
              className={cn(
                'flex flex-col items-center rounded-lg border-2 p-6 text-center transition-all',
                option.enabled
                  ? 'hover:border-primary hover:bg-accent cursor-pointer'
                  : 'cursor-not-allowed opacity-50',
                selectedType === option.id
                  ? 'border-primary bg-accent'
                  : 'border-border',
              )}>
              <div
                className={cn(
                  'mb-4',
                  selectedType === option.id
                    ? 'text-primary'
                    : 'text-muted-foreground',
                )}>
                {option.icon}
              </div>
              <h3 className="mb-2 text-sm font-semibold">{option.title}</h3>
              <p className="text-muted-foreground text-xs">
                {option.description}
              </p>
              {!option.enabled && (
                <span className="text-muted-foreground mt-2 text-xs italic">
                  Coming soon
                </span>
              )}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!selectedType}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
