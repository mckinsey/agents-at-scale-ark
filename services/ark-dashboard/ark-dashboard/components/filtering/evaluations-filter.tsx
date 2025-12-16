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

export interface LabelFilter {
  key: string;
  value: string;
}

export interface EvaluationFilters {
  search: string;
  status: string[];
  evaluator: string[];
  mode: string[];
  passed: string; // 'all' | 'passed' | 'failed' | 'unknown'
  scoreMin: string;
  scoreMax: string;
  evaluationType: string[]; // For enhanced filtering
  labelFilters: LabelFilter[];
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
  labelFilters: [],
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

  const clearScoreFilter = () => {
    onFiltersChange({ ...filters, ['scoreMin']: '', ['scoreMax']: '' });
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

  const addLabelFilter = () => {
    const newFilter: LabelFilter = {
      key: '',
      value: '',
    };
    updateFilter('labelFilters', [...filters.labelFilters, newFilter]);
  };

  const updateLabelFilter = (
    index: number,
    field: keyof LabelFilter,
    value: string,
  ) => {
    const newLabelFilters = [...filters.labelFilters];
    newLabelFilters[index] = { ...newLabelFilters[index], [field]: value };
    updateFilter('labelFilters', newLabelFilters);
  };

  const removeLabelFilter = (index: number) => {
    console.log('removeLabelFilter', index);
    const newLabelFilters = filters.labelFilters.filter((_, i) => i !== index);
    updateFilter('labelFilters', newLabelFilters);
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
    if (filters.labelFilters.length > 0) count++;
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

            {/* Label Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Label</Label>
              {filters.labelFilters.length === 0 ? (
                <div className="text-muted-foreground rounded border border-dashed py-4 text-center">
                  <p className="text-xs">No label filters configured</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filters.labelFilters.map((labelFilter, index) => {
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-lg border p-2">
                        <Input
                          placeholder="Label key"
                          value={labelFilter.key || ''}
                          onChange={e =>
                            updateLabelFilter(index, 'key', e.target.value)
                          }
                          className="border-border h-8 flex-1 text-xs"
                        />
                        <span className="text-muted-foreground text-xs">:</span>
                        <Input
                          placeholder="Value"
                          value={labelFilter.value}
                          onChange={e =>
                            updateLabelFilter(index, 'value', e.target.value)
                          }
                          className="border-border h-8 flex-1 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLabelFilter(index)}
                          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLabelFilter}
                className="w-full text-xs">
                + Add Label Filter
              </Button>
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
            <div className="bg-secondary flex items-center gap-1 rounded-md p-1 text-xs">
              <p>Search: {filters.search}</p>
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter('search', '')}
              />
            </div>
          )}
          {filters.status.map(status => (
            <div
              className="bg-secondary flex items-center gap-1 rounded-md p-1 text-xs"
              key={status}>
              <p>Status: {status}</p>
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('status', status)}
              />
            </div>
          ))}
          {filters.evaluator.map(evaluator => (
            <div
              className="bg-secondary flex items-center gap-1 rounded-md p-1 text-xs"
              key={evaluator}>
              <p>Evaluator: {evaluator}</p>
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('evaluator', evaluator)}
              />
            </div>
          ))}
          {filters.mode.map(mode => (
            <div
              className="bg-secondary flex items-center gap-1 rounded-md p-1 text-xs"
              key={mode}>
              <p>Mode: {mode}</p>
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('mode', mode)}
              />
            </div>
          ))}
          {filters.evaluationType.map(type => (
            <div
              className="bg-secondary flex items-center gap-1 rounded-md p-1 text-xs"
              key={type}>
              <p>Type: {type}</p>
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('evaluationType', type)}
              />
            </div>
          ))}
          {filters.passed !== 'all' && (
            <div className="bg-secondary flex items-center gap-1 rounded-md p-1 text-xs">
              <p>Pass Status: {filters.passed}</p>
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter('passed', 'all')}
              />
            </div>
          )}
          {(filters.scoreMin || filters.scoreMax) && (
            <div className="bg-secondary flex items-center gap-1 rounded-md p-1 text-xs">
              <p>
                Score: {filters.scoreMin || '0'}-{filters.scoreMax || '1'}
              </p>
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  clearScoreFilter();
                }}
              />
            </div>
          )}
          {filters.labelFilters.map((labelFilter, index) => {
            if (!labelFilter.key || !labelFilter.value) return null;
            return (
              <div
                className="bg-secondary flex items-center gap-1 rounded-md p-1 text-xs"
                key={labelFilter.key}>
                <p>
                  Label - {labelFilter.key} : {labelFilter.value}
                </p>
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => {
                    removeLabelFilter(index);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
