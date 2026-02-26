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
      {agentName} has terminated the conversation with the following message:
    </div>
  );
}
