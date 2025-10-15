"use client";

import React, { useEffect, useRef, useState } from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface BaseCardAction {
  icon: LucideIcon | React.FC<{ className?: string }>;
  label: string;
  onClick: () => void;
  variant?:
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";
  className?: string;
  disabled?: boolean;
}

export interface BaseCardProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon | React.ReactElement;
  iconClassName?: string;
  actions?: BaseCardAction[];
  children?: React.ReactNode;
  className?: string;
  cardClassName?: string;
  footer?: React.ReactNode;
}

export function BaseCard({
  title,
  description,
  icon: Icon,
  iconClassName,
  actions = [],
  children,
  className,
  cardClassName,
  footer
}: BaseCardProps) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const checkTruncation = () => {
      if (titleRef.current) {
        setIsTruncated(
          titleRef.current.scrollWidth > titleRef.current.clientWidth
        );
      }
    };

    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [title]);

  const titleElement = (
    <span ref={titleRef} className="truncate block">
      {title}
    </span>
  );

  return (
    <Card className={cn("relative", cardClassName)}>
      <CardHeader className="flex flex-row pr-3.5">
        <CardTitle className="overflow-hidden max-w-full flex items-center text-lg gap-2">
          {Icon && (
            React.isValidElement(Icon) ? (
              <div className="h-5 w-5 flex-shrink-0">
                {Icon}
              </div>
            ) : typeof Icon === 'function' ? (
              <Icon className={cn("h-5 w-5 flex-shrink-0", iconClassName)} />
            ) : null
          )}
          {isTruncated ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>{titleElement}</TooltipTrigger>
                <TooltipContent>
                  <p>{title}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            titleElement
          )}
        </CardTitle>
        {actions.length > 0 && (
          <CardAction className="flex ml-auto">
            {actions.map((action, index) => {
              const IconComponent = action.icon;
              return (
                <Button
                  key={index}
                  variant={action.variant || "ghost"}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={action.onClick}
                  aria-label={action.label}
                  disabled={action.disabled}
                >
                  <IconComponent className={cn("h-4 w-4", action.className)} />
                </Button>
              );
            })}
          </CardAction>
        )}
      </CardHeader>
      <div
        className={cn(
          "flex-1 flex-col flex w-full h-full px-6 py-3",
          className
        )}
      >
        {children}
      </div>
      {description && (
        <div className="flex-1 flex-row flex w-full h-full px-6">
          <CardDescription>{description}</CardDescription>
        </div>
      )}
      {footer && (
        <div className="flex-1 flex-row flex w-full h-full px-6">
          {footer}
        </div>
      )}
    </Card>
  );
}
