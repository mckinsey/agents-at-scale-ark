'use client';

import {
  AlertCircle,
  CheckCircle,
  Clock,
  Filter,
  Play,
  Search,
  Square,
  X,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

export interface EvaluationFilters {
  search: string;
  status: string[];
  evaluator: string[];
  mode: string[];
  passed: string; // 'all' | 'passed' | 'failed' | 'unknown'
  scoreMin: string;
  scoreMax: string;
  evaluationType: string[]; // For enhanced filtering
}

interface EvaluationFilterProps {
  filters: EvaluationFilters;
  onFiltersChange: (filters: EvaluationFilters) => void;
  availableEvaluators: string[];
  availableTypes: string[];
}

const DEFAULT_FILTERS: EvaluationFilters = {
  search: '',
  status: [],
  evaluator: [],
  mode: [],
  passed: 'all',
  scoreMin: '',
  scoreMax: '',
  evaluationType: [],
};

const STATUS_OPTIONS = [
  { value: 'done', label: 'Done', icon: CheckCircle, color: 'text-green-600' },
  { value: 'running', label: 'Running', icon: Play, color: 'text-blue-600' },
  { value: 'error', label: 'Error', icon: AlertCircle, color: 'text-red-600' },
  {
    value: 'canceled',
    label: 'Canceled',
    icon: Square,
    color: 'text-gray-600',
  },
];

const PASSED_OPTIONS = [
  { value: 'all', label: 'All' },
  {
    value: 'passed',
    label: 'Passed',
    icon: CheckCircle,
    color: 'text-green-600',
  },
  { value: 'failed', label: 'Failed', icon: XCircle, color: 'text-red-600' },
  { value: 'unknown', label: 'Unknown', icon: Clock, color: 'text-gray-600' },
];

export function EvaluationFilter({
  filters,
  onFiltersChange,
  availableEvaluators,
  availableTypes,
}: EvaluationFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = <TK extends keyof EvaluationFilters>(
    key: TK,
    value: EvaluationFilters[TK],
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (
    key: 'status' | 'evaluator' | 'mode' | 'evaluationType',
    value: string,
  ) => {
    const currentArray = filters[key];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    updateFilter(key, newArray);
  };

  const clearFilters = () => {
    onFiltersChange(DEFAULT_FILTERS);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.search) count++;
    if (filters.status.length > 0) count++;
    if (filters.evaluator.length > 0) count++;
    if (filters.mode.length > 0) count++;
    if (filters.passed !== 'all') count++;
    if (filters.scoreMin || filters.scoreMax) count++;
    if (filters.evaluationType.length > 0) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="flex items-center gap-2">
      {/* Search Input */}
      <div className="relative max-w-sm flex-1">
        <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
        <Input
          placeholder="Search evaluations..."
          value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Filter Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-auto p-1 text-xs">
                  Clear all
                </Button>
              )}
            </div>

            <Separator />

            {/* Status Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map(option => {
                  const Icon = option.icon;
                  const isSelected = filters.status.includes(option.value);
                  return (
                    <Button
                      key={option.value}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleArrayFilter('status', option.value)}
                      className="justify-start gap-2">
                      <Icon
                        className={`h-3 w-3 ${isSelected ? '' : option.color}`}
                      />
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Evaluator Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Evaluator</Label>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {availableEvaluators.map(evaluator => {
                  const isSelected = filters.evaluator.includes(evaluator);
                  return (
                    <Button
                      key={evaluator}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleArrayFilter('evaluator', evaluator)}
                      className="w-full justify-start text-xs">
                      {evaluator}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Evaluation Type Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Evaluation Type</Label>
              <div className="flex flex-wrap gap-1">
                {availableTypes.map(type => {
                  const isSelected = filters.mode.includes(type);
                  return (
                    <Button
                      key={type}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleArrayFilter('mode', type)}
                      className="text-xs capitalize">
                      {type}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Pass/Fail Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pass Status</Label>
              <Select
                value={filters.passed}
                onValueChange={value => updateFilter('passed', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PASSED_OPTIONS.map(option => {
                    const Icon = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          {Icon && (
                            <Icon className={`h-3 w-3 ${option.color || ''}`} />
                          )}
                          {option.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Score Range Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Score Range</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  min="0"
                  max="1"
                  step="0.01"
                  value={filters.scoreMin}
                  onChange={e => updateFilter('scoreMin', e.target.value)}
                  className="text-xs"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <Input
                  type="number"
                  placeholder="Max"
                  min="0"
                  max="1"
                  step="0.01"
                  value={filters.scoreMax}
                  onChange={e => updateFilter('scoreMax', e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {filters.search}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter('search', '')}
              />
            </Badge>
          )}
          {filters.status.map(status => (
            <Badge key={status} variant="secondary" className="gap-1">
              {status}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('status', status)}
              />
            </Badge>
          ))}
          {filters.evaluator.map(evaluator => (
            <Badge
              key={evaluator}
              variant="secondary"
              className="gap-1 text-xs">
              {evaluator}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('evaluator', evaluator)}
              />
            </Badge>
          ))}
          {filters.mode.map(mode => (
            <Badge key={mode} variant="secondary" className="gap-1">
              {mode}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('mode', mode)}
              />
            </Badge>
          ))}
          {filters.evaluationType.map(type => (
            <Badge key={type} variant="secondary" className="gap-1">
              Type: {type}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('evaluationType', type)}
              />
            </Badge>
          ))}
          {filters.passed !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {filters.passed}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter('passed', 'all')}
              />
            </Badge>
          )}
          {(filters.scoreMin || filters.scoreMax) && (
            <Badge variant="secondary" className="gap-1">
              Score: {filters.scoreMin || '0'}-{filters.scoreMax || '1'}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  updateFilter('scoreMin', '');
                  updateFilter('scoreMax', '');
                }}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
