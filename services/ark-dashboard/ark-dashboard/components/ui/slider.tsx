'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

// Types

type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> & {
  showStepMarkers?: boolean;
  showValueTooltip?: boolean;
  showStepLabels?: boolean;
  formatValue?: (value: number) => string;
};

type Marker = { value: number; percentage: number };

// Helpers

/**
 * Helper function to check if a value is in the active (filled) range
 * @param value - The value to check
 * @param currentValues - The current values of the slider
 * @returns True if the value is in the active (filled) range, false otherwise
 */
const isValueInRange = (value: number, currentValues: number[]): boolean => {
  if (currentValues.length === 1) return value <= currentValues[0];
  const [minVal, maxVal] = [
    Math.min(...currentValues),
    Math.max(...currentValues),
  ];
  return value >= minVal && value <= maxVal;
};

/**
 * Helper function to generate marker data
 * @param min - The minimum value of the slider
 * @param max - The maximum value of the slider
 * @param step - The step size of the slider
 * @param showIntermediate - Whether to show intermediate markers
 * @returns An array of markers
 */
const generateMarkers = (
  min: number,
  max: number,
  step: number | undefined,
  showIntermediate: boolean,
): Marker[] => {
  const markers: Marker[] = [{ value: min, percentage: 0 }];

  if (showIntermediate && step && step > 0) {
    for (let i = min + step; i < max; i += step) {
      markers.push({ value: i, percentage: ((i - min) / (max - min)) * 100 });
    }
  }

  markers.push({ value: max, percentage: 100 });
  return markers;
};

// Components

/**
 * Component to render a step marker
 * @param marker - The marker to render
 * @param isActive - Whether the marker is active
 * @param isVertical - Whether the slider is vertical
 * @param showLabel - Whether to show the label
 * @returns A React component
 */
const StepMarker = React.memo(
  ({
    marker,
    isActive,
    isVertical,
    showLabel,
    disabled,
  }: {
    marker: Marker;
    isActive: boolean;
    isVertical: boolean;
    showLabel: boolean;
    disabled: boolean;
  }) => {
    let labelColor = 'text-fg-tertiary';

    if (disabled) {
      labelColor = 'text-fg-disabled';
    } else if (isActive) {
      labelColor = 'text-fg-primary';
    }

    return (
      <div
        className={cn(
          'pointer-events-none absolute flex items-center',
          isVertical
            ? 'left-1/2 -translate-x-1/2 flex-row'
            : 'top-1/2 -translate-x-1/2 -translate-y-1/2 flex-col',
        )}
        style={{ [isVertical ? 'top' : 'left']: `${marker.percentage}%` }}>
        <div
          className={cn(
            'h-1 w-1 rounded-full transition-colors',
            isActive ? 'bg-fill-active' : 'bg-slider-track',
          )}
        />

        {showLabel && (
          <span
            className={cn(
              'label-regular-primary whitespace-nowrap',
              isVertical
                ? 'ml-1.5'
                : 'absolute top-full left-1/2 mt-2 -translate-x-1/2',
              labelColor,
            )}>
            {marker.value}
          </span>
        )}
      </div>
    );
  },
);
StepMarker.displayName = 'StepMarker';

/**
 * Component to render a slider
 * @param className - The class name to apply to the slider
 * @param defaultValue - The default value of the slider
 * @param value - The value of the slider
 * @param min - The minimum value of the slider
 * @param max - The maximum value of the slider
 * @param step - The step size of the slider
 * @param showStepMarkers - Whether to show step markers
 * @param showValueTooltip - Whether to show value tooltip
 * @param showStepLabels - Whether to show step labels
 * @param formatValue - The function to format the value
 * @param onValueChange - The function to call when the value changes
 * @param props - Additional props to pass to the slider
 * @returns A React component
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step,
  disabled = false,
  showStepMarkers = false,
  showValueTooltip = true,
  showStepLabels = true,
  formatValue = val => val.toString(),
  onValueChange,
  ...props
}: SliderProps) {
  const [internalValue, setInternalValue] = React.useState<number[]>(
    () => value ?? defaultValue ?? [min],
  );
  const [isInteracting, setIsInteracting] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);

  const currentValue = value ?? internalValue;
  const isVertical = props.orientation === 'vertical';

  const handleValueChange = React.useCallback(
    (newValue: number[]) => {
      setInternalValue(newValue);
      onValueChange?.(newValue);
    },
    [onValueChange],
  );

  const markers = React.useMemo(
    () => generateMarkers(min, max, step, showStepMarkers),
    [min, max, step, showStepMarkers],
  );

  const thumbClasses = cn(
    'relative flex items-center justify-center w-4 h-4 rounded-full transition-all duration-200',
    'bg-fill-active shadow-none',
    'hover:outline hover:outline-2 hover:outline-stroke-primary',
    'focus:outline focus:outline-2 focus:outline-stroke-primary focus:shadow-elevation-1',
    'active:shadow-elevation-1',
    'data-[disabled]:pointer-events-none data-[disabled]:bg-fill-onsurface-ui-2 data-[disabled]:shadow-elevation-0',
    'cursor-pointer',
  );

  return (
    <SliderPrimitive.Root
      {...props}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      minStepsBetweenThumbs={1}
      onValueChange={handleValueChange}
      className={cn(
        'relative flex w-full touch-none items-center select-none',
        'data-[orientation=horizontal]:px-2',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-22 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-[orientation=vertical]:py-2',
        className,
      )}>
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          'bg-slider-track relative grow',
          'data-[orientation=horizontal]:h-[1px] data-[orientation=horizontal]:w-full',
          'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-[1px]',
        )}>
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="bg-fill-active absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />

        {markers.map((marker, i) => (
          <StepMarker
            key={`${marker.value}-${i}`}
            marker={marker}
            isActive={isValueInRange(marker.value, currentValue)}
            isVertical={isVertical}
            showLabel={showStepLabels}
            disabled={disabled}
          />
        ))}
      </SliderPrimitive.Track>

      {currentValue.map((_, i) => (
        <Tooltip
          key={i}
          open={showValueTooltip && (isInteracting || isHovering)}>
          <TooltipTrigger asChild>
            <SliderPrimitive.Thumb
              data-slot="slider-thumb"
              className={thumbClasses}
              onPointerDown={() => setIsInteracting(true)}
              onPointerUp={() => setIsInteracting(false)}
              onPointerEnter={() => setIsHovering(true)}
              onPointerLeave={() => {
                setIsInteracting(false);
                setIsHovering(false);
              }}>
              <div className="bg-fill-active-inverse h-1 w-1 rounded-full" />
            </SliderPrimitive.Thumb>
          </TooltipTrigger>

          <TooltipContent
            side={isVertical ? 'left' : 'top'}
            sideOffset={6}
            className="max-w-[140px] min-w-[36px] !animate-none truncate text-center leading-4 tracking-[0.024px]">
            {formatValue(currentValue[i])}
          </TooltipContent>
        </Tooltip>
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
