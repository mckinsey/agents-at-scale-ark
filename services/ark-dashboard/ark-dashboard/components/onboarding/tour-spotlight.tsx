'use client';

import { useEffect, useState } from 'react';

import { ArrowForward, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import type { TourStep } from '@/lib/constants/tour-steps';
import { cn } from '@/lib/utils';

interface TourSpotlightProps {
  steps: TourStep[];
  activeStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onAction: (href: string) => void;
  readOnly?: boolean;
}

const PADDING = 8;

export const READ_ONLY_HINT =
  'You have view-only access in this namespace. Ask an admin for edit permissions.';

export function TourSpotlight({
  steps,
  activeStep,
  onNext,
  onPrev,
  onSkip,
  onAction,
  readOnly = false,
}: Readonly<TourSpotlightProps>) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const currentStep = steps[activeStep];

  useEffect(() => {
    if (!currentStep) return;

    const selector = `[data-onboarding-id="${currentStep.targetId}"]`;
    let resizeObserver: ResizeObserver | undefined;

    const track = (target: HTMLElement) => {
      const update = () => setRect(target.getBoundingClientRect());
      target.scrollIntoView({ block: 'nearest' });
      update();
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(target);
      resizeObserver.observe(document.body);
    };

    const initialTarget = document.querySelector<HTMLElement>(selector);
    if (initialTarget) {
      track(initialTarget);
      return () => resizeObserver?.disconnect();
    }

    setRect(null);
    const mutationObserver = new MutationObserver(() => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) return;
      mutationObserver.disconnect();
      track(target);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [currentStep]);

  if (!currentStep) return null;

  const isLastStep = activeStep === steps.length - 1;
  const { action, actionHref, resource } = currentStep;
  const isActionBlocked = readOnly && Boolean(resource);

  const highlight = rect
    ? {
        x: rect.left - PADDING,
        y: rect.top - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  const anchorStyle = highlight
    ? {
        left: highlight.x,
        top: highlight.y,
        width: highlight.width,
        height: highlight.height,
      }
    : { left: '50%', top: '50%', width: 0, height: 0 };

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {highlight ? (
        <svg className="pointer-events-auto absolute inset-0 h-full w-full">
          <defs>
            <mask id="tour-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect {...highlight} fill="black" />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.7)"
            mask="url(#tour-spotlight-mask)"
          />
          <rect
            {...highlight}
            fill="none"
            strokeWidth="2"
            className="animate-pulse"
            style={{ stroke: 'var(--brand-accents-qb-accent)' }}
          />
        </svg>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-black/70" />
      )}

      <Popover open>
        <PopoverAnchor asChild>
          <div className="pointer-events-none fixed" style={anchorStyle} />
        </PopoverAnchor>
        <PopoverContent
          side={highlight ? 'right' : 'bottom'}
          align={highlight ? 'start' : 'center'}
          sideOffset={highlight ? 16 : 0}
          collisionPadding={16}
          onOpenAutoFocus={e => e.preventDefault()}
          className="shadow-elevation-2 pointer-events-auto z-[70] w-[320px] border-0 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((step, i) => (
                <div
                  key={step.targetId}
                  className={cn(
                    'h-1 transition-all duration-300',
                    i === activeStep
                      ? 'bg-brand-accents-qb-accent w-4'
                      : 'bg-stroke-divider w-1.5',
                  )}
                />
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip
            </Button>
          </div>

          <h2 className="headings-h3-regular text-fg-primary mb-2">
            {currentStep.title}
          </h2>
          <p className="paragraph-regular-primary text-fg-secondary mb-4">
            {currentStep.message}
          </p>

          {action && actionHref && (
            <div className="mb-4 flex flex-col gap-2">
              <Button
                variant="secondary"
                disabled={isActionBlocked}
                onClick={() => onAction(actionHref)}
                className="group w-full justify-between">
                <span>{action}</span>
                <ArrowForward className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
              {isActionBlocked && (
                <p className="label-small-primary text-fg-tertiary">
                  {READ_ONLY_HINT}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {activeStep > 0 && (
              <Button variant="outline" onClick={onPrev} className="flex-1">
                Back
              </Button>
            )}
            <Button onClick={onNext} className="flex-1">
              {isLastStep ? 'Finish Tour' : 'Next'}
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
