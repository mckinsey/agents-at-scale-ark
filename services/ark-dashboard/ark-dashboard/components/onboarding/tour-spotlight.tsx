'use client';

import { ArrowRight, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
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

const CARD_WIDTH = 320;
const CARD_MAX_HEIGHT = 340;
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

    const updateRect = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-onboarding-id="${currentStep.targetId}"]`,
      );
      if (!target) {
        setRect(null);
        return;
      }
      target.scrollIntoView({ block: 'nearest' });
      setRect(target.getBoundingClientRect());
    };

    updateRect();
    const timer = setTimeout(updateRect, 120);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [currentStep]);

  if (!currentStep || !rect) return null;

  const placeLeft = rect.right + 20 + CARD_WIDTH > window.innerWidth;
  const tooltipX = placeLeft ? rect.left - CARD_WIDTH - 20 : rect.right + 20;
  const tooltipY = Math.min(
    Math.max(20, rect.top),
    window.innerHeight - CARD_MAX_HEIGHT,
  );
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

      <div
        style={{ left: tooltipX, top: tooltipY, width: CARD_WIDTH }}
        className="animate-in fade-in zoom-in-95 bg-surface-bg-primary shadow-elevation-2 pointer-events-auto absolute p-6 duration-200">
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
          <button
            type="button"
            onClick={onSkip}
            className="text-fg-secondary hover:text-fg-primary text-xs font-semibold transition-colors">
            Skip
          </button>
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
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
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
      </div>
    </div>
  );
}
