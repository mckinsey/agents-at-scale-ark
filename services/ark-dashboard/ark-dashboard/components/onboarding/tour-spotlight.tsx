'use client';

import { useEffect, useState } from 'react';

import { ArrowForward, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { TourStep } from './tour-steps';

interface TourSpotlightProps {
  steps: TourStep[];
  activeStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onAction: (href: string) => void;
}

const PADDING = 8;

export function TourSpotlight({
  steps,
  activeStep,
  onNext,
  onPrev,
  onSkip,
  onAction,
}: Readonly<TourSpotlightProps>) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const currentStep = steps[activeStep];

  useEffect(() => {
    if (!currentStep) return;

    const target = document.querySelector<HTMLElement>(
      `[data-onboarding-id="${currentStep.targetId}"]`,
    );
    if (!target) {
      setRect(null);
      return;
    }

    const update = () => setRect(target.getBoundingClientRect());
    target.scrollIntoView({ block: 'nearest' });
    update();

    const observer = new ResizeObserver(update);
    observer.observe(target);
    observer.observe(document.body);

    return () => observer.disconnect();
  }, [currentStep]);

  if (!currentStep || !rect) return null;

  const isLastStep = activeStep === steps.length - 1;
  const { action, actionHref } = currentStep;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <svg className="pointer-events-auto absolute inset-0 h-full w-full">
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - PADDING}
              y={rect.top - PADDING}
              width={rect.width + PADDING * 2}
              height={rect.height + PADDING * 2}
              fill="black"
            />
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
          x={rect.left - PADDING}
          y={rect.top - PADDING}
          width={rect.width + PADDING * 2}
          height={rect.height + PADDING * 2}
          fill="none"
          strokeWidth="2"
          className="animate-pulse"
          style={{ stroke: 'var(--brand-accents-qb-accent)' }}
        />
      </svg>

      <Popover open>
        <PopoverAnchor asChild>
          <div
            className="pointer-events-none fixed"
            style={{
              left: rect.left - PADDING,
              top: rect.top - PADDING,
              width: rect.width + PADDING * 2,
              height: rect.height + PADDING * 2,
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={16}
          collisionPadding={16}
          onOpenAutoFocus={e => e.preventDefault()}
          className="pointer-events-auto z-[70] w-[320px] border-0 p-6 shadow-elevation-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((step, i) => (
                <div
                  key={step.targetId + i}
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
            <Button
              variant="secondary"
              onClick={() => onAction(actionHref)}
              className="group mb-4 w-full justify-between">
              <span>{action}</span>
              <ArrowForward className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
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
