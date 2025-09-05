"use client";

import React, { useEffect, useRef, useState } from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
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
    <span ref={titleRef} className="truncate block max-w-[220px] overflow-hidden">
      {title}
    </span>
  );

  return (
    <Card className={cn("relative", cardClassName)}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 pr-24">
          {Icon && (
            React.isValidElement(Icon) ? (
              Icon
            ) : typeof Icon === 'function' ? (
              <Icon className={cn("h-5 w-5 flex-shrink-0", iconClassName)} />
            ) : null
          )}
          <div className="truncate block max-w-[220px]">
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
          </div>
        </CardTitle>
        {actions.length > 0 && (
          <div className="absolute right-2 top-2 flex gap-1">
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
          </div>
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
