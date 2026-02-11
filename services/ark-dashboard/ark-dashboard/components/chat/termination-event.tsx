interface TerminationEventProps {
  agentName: string;
  className?: string;
}

export function TerminationEvent({
  agentName,
  className,
}: Readonly<TerminationEventProps>) {
  return (
    <div className={`text-muted-foreground text-sm italic ${className || ''}`}>
      Conversation terminated by {agentName}
    </div>
  );
}
