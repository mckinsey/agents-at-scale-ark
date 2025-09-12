"use client";

import { EvaluationEditor } from "@/components/editors";
import {
  EvaluationFilter,
  type EvaluationFilters
} from "@/components/filtering";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import type { components } from "@/lib/api/generated/types";
import type { Evaluation, EvaluationDetailResponse } from "@/lib/services";
import { evaluationsService } from "@/lib/services/evaluations";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  RefreshCw,
  StopCircle,
  Trash2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useGetAllEvaluationsWithDetails } from "../../lib/services/evaluations-hooks";
import { formatAge } from "../../lib/utils/time";

type EvaluationCreateRequest = components["schemas"]["EvaluationCreateRequest"];
type EvaluationUpdateRequest = components["schemas"]["EvaluationUpdateRequest"];

interface EvaluationsSectionProps {
  namespace: string;
  initialQueryFilter?: string | null;
}

type SortField = "name" | "score" | "status";
type SortDirection = "asc" | "desc";

const StatusDot = ({
  variant,
  onCancel
}: {
  variant: "done" | "error" | "running" | "evaluating" | "canceled" | "default";
  onCancel?: () => void;
}) => {
  const getColor = () => {
    switch (variant) {
      case "done":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      case "running":
        return "bg-blue-500 animate-pulse";
      case "evaluating":
        return "bg-yellow-500 animate-pulse";
      case "canceled":
        return "bg-gray-500";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${getColor()}`} />
      <span className="text-sm capitalize">{variant}</span>
      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="h-6 w-6 p-0"
        >
          <StopCircle className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

export const EvaluationsSection = forwardRef<
  { openAddEditor: () => void },
  EvaluationsSectionProps
>(function EvaluationsSection({ namespace, initialQueryFilter }, ref) {
  const [evaluations, setEvaluations] = useState<
    (Evaluation | EvaluationDetailResponse)[]
  >([]);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEvaluation, setEditingEvaluation] = useState<Evaluation | null>(
    null
  );
  const [activeTab, setActiveTab] = useState("standard");
  const [filters, setFilters] = useState<EvaluationFilters>({
    search: initialQueryFilter || "",
    status: [],
    evaluator: [],
    mode: [],
    passed: "all",
    scoreMin: "",
    scoreMax: "",
    evaluationType: []
  });
  const router = useRouter();

  useImperativeHandle(ref, () => ({
    openAddEditor: () => {
      setEditingEvaluation(null);
      setEditorOpen(true);
    }
  }));

  const {
    data: listEvaluationsData,
    isLoading: listEvaluationsLoading,
    isFetching: listEvaluationsFetching,
    isError: listEvaluationsError,
    error: listEvaluationsErrorObject,
    refetch: loadEvaluations
  } = useGetAllEvaluationsWithDetails({ namespace });

  useEffect(() => {
    if (listEvaluationsData && !listEvaluationsError) {
      setEvaluations(listEvaluationsData);
    }

    if (listEvaluationsError) {
      toast({
        variant: "destructive",
        title: "Failed to Load Evaluations",
        description:
          listEvaluationsErrorObject instanceof Error
            ? listEvaluationsErrorObject.message
            : "An unexpected error occurred"
      });
    }
  }, [listEvaluationsError, listEvaluationsData, listEvaluationsErrorObject]);

  const getEvaluatorDisplay = (
    evaluation: Evaluation | EvaluationDetailResponse
  ) => {
    // First try to get from spec if available (detailed API response)
    const spec = (evaluation as EvaluationDetailResponse)?.spec;
    const evaluatorSpec = spec?.evaluator as { name?: string };
    if (evaluatorSpec?.name) {
      return evaluatorSpec.name;
    }

    // Fallback: extract evaluator name from evaluation name pattern
    // Pattern: {evaluator-name}-{query-name}-eval
    // Examples:
    // cost-evaluator-expensive-complex-query-eval -> cost-evaluator
    // evaluator-llm-with-selector-math-query-2-eval -> evaluator-llm-with-selector
    if (evaluation.name.endsWith("-eval")) {
      const nameWithoutSuffix = evaluation.name.replace(/-eval$/, "");

      // Known evaluator patterns
      const evaluatorPatterns = [
        { prefix: "cost-evaluator-", name: "cost-evaluator" },
        { prefix: "performance-evaluator-", name: "performance-evaluator" },
        {
          prefix: "high-performance-evaluator-",
          name: "high-performance-evaluator"
        },
        {
          prefix: "evaluator-llm-with-selector-",
          name: "evaluator-llm-with-selector"
        }
      ];

      for (const pattern of evaluatorPatterns) {
        if (nameWithoutSuffix.startsWith(pattern.prefix)) {
          return pattern.name;
        }
      }

      // Fallback: assume the first few parts are the evaluator name
      const parts = nameWithoutSuffix.split("-");
      if (parts.length >= 2) {
        // Take the first 2-3 parts as evaluator name
        if (parts[0] === "evaluator" && parts.length > 3) {
          return parts.slice(0, 4).join("-"); // Handle "evaluator-llm-with-selector"
        } else {
          return parts.slice(0, 2).join("-"); // Handle "cost-evaluator", "performance-evaluator"
        }
      }
    }

    return "-";
  };

  const getQueryRefDisplay = (
    evaluation: Evaluation | EvaluationDetailResponse
  ) => {
    // First try to get from spec if available (detailed API response)
    const spec = (evaluation as EvaluationDetailResponse)?.spec;
    const config = spec?.config as {
      queryRef?: { name?: string };
      datasetRef?: { name?: string };
    };
    const queryRefSpec = config?.queryRef;
    const datasetRefSpec = config?.datasetRef;

    // For dataset evaluations, check for datasetRef first
    const mode = getTypeDisplay(evaluation);
    if (mode === "dataset" && datasetRefSpec?.name) {
      return datasetRefSpec.name;
    }

    if (queryRefSpec?.name) {
      return queryRefSpec.name;
    }

    // Fallback: extract reference from evaluation name pattern
    // Pattern observed: {evaluator-name}-{query-name/dataset-name}-eval
    // Examples:
    // cost-evaluator-expensive-complex-query-eval -> expensive-complex-query
    // evaluator-llm-with-selector-math-query-2-eval -> math-query-2
    // dataset-evaluator-math-dataset-eval -> math-dataset
    if (evaluation.name.endsWith("-eval")) {
      const nameWithoutSuffix = evaluation.name.replace(/-eval$/, "");

      // Known evaluator prefixes to remove
      const evaluatorPrefixes = [
        "cost-evaluator-",
        "performance-evaluator-",
        "high-performance-evaluator-",
        "evaluator-llm-with-selector-"
      ];

      for (const prefix of evaluatorPrefixes) {
        if (nameWithoutSuffix.startsWith(prefix)) {
          return nameWithoutSuffix.substring(prefix.length);
        }
      }

      // Fallback: assume the last few parts are the reference name
      const parts = nameWithoutSuffix.split("-");
      if (parts.length >= 2) {
        // Take the last 2-3 parts as reference name
        const refName = parts.slice(-3).join("-");
        if (
          refName.includes("query") ||
          refName.includes("dataset") ||
          refName.match(/\d/) ||
          parts.length <= 4
        ) {
          return refName;
        }
      }
    }

    return "-";
  };

  const getTypeDisplay = (
    evaluation: Evaluation | EvaluationDetailResponse
  ) => {
    const spec = (evaluation as EvaluationDetailResponse)?.spec;
    const specMode = spec?.type as string;
    const basicMode = (evaluation as Evaluation).type;
    return specMode || basicMode || "unknown";
  };

  const getScoreDisplay = (
    evaluation: Evaluation | EvaluationDetailResponse
  ) => {
    // Try to get score from basic evaluation first
    let score: string | number | null | undefined = (evaluation as Evaluation)
      .score;

    // If not found, try to get from detailed response status
    if (score === null || score === undefined) {
      const detailedStatus = (evaluation as EvaluationDetailResponse)
        ?.status as Record<string, unknown>;
      score = detailedStatus?.score as string | number;
    }

    if (score === null || score === undefined) return "-";
    if (typeof score === "number") return score.toFixed(2);
    if (typeof score === "string") return score;
    return String(score);
  };

  const getPassedDisplay = (
    evaluation: Evaluation | EvaluationDetailResponse
  ) => {
    // Try to get passed from basic evaluation first
    let passed = (evaluation as Evaluation).passed;

    // If not found, try to get from detailed response status
    if (passed === null || passed === undefined) {
      const detailedStatus = (evaluation as EvaluationDetailResponse)
        ?.status as Record<string, unknown>;
      passed = detailedStatus?.passed as boolean;
    }

    if (passed === null || passed === undefined) return "-";
    return passed ? "✓" : "✗";
  };

  // Extract unique values for filter options based on current tab
  const getAvailableEvaluators = () => {
    const evaluators = new Set<string>();
    currentEvaluations.forEach((evaluation) => {
      const evaluatorName = getEvaluatorDisplay(evaluation);
      if (evaluatorName !== "-") {
        evaluators.add(evaluatorName);
      }
    });
    return Array.from(evaluators).sort();
  };

  const getAvailableTypes = () => {
    const modes = new Set<string>();
    currentEvaluations.forEach((evaluation) => {
      const mode = getTypeDisplay(evaluation);
      if (mode !== "unknown") {
        modes.add(mode);
      }
    });
    return Array.from(modes).sort();
  };

  // Separate evaluations by type
  const standardEvaluations = evaluations.filter((evaluation) => {
    const mode = getTypeDisplay(evaluation);
    return ["direct", "query", "batch", "manual", "event"].includes(mode);
  });

  const datasetEvaluations = evaluations.filter((evaluation) => {
    const mode = getTypeDisplay(evaluation);
    return mode === "baseline";
  });

  // Get current evaluations based on active tab
  const currentEvaluations =
    activeTab === "dataset" ? datasetEvaluations : standardEvaluations;

  // Filter evaluations based on current filters
  const filteredEvaluations = currentEvaluations.filter((evaluation) => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch =
        evaluation.name.toLowerCase().includes(searchLower) ||
        getEvaluatorDisplay(evaluation).toLowerCase().includes(searchLower) ||
        getQueryRefDisplay(evaluation).toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Status filter
    if (filters.status.length > 0) {
      const status = getStatus(evaluation);
      if (!filters.status.includes(status)) return false;
    }

    // Evaluator filter
    if (filters.evaluator.length > 0) {
      const evaluator = getEvaluatorDisplay(evaluation);
      if (!filters.evaluator.includes(evaluator)) return false;
    }

    // Mode filter
    if (filters.mode.length > 0) {
      const mode = getTypeDisplay(evaluation);
      if (!filters.mode.includes(mode)) return false;
    }

    // Pass/Fail filter
    if (filters.passed !== "all") {
      // Try to get passed from basic evaluation first
      let passed = (evaluation as Evaluation).passed;

      // If not found, try to get from detailed response status
      if (passed === null || passed === undefined) {
        const detailedStatus = (evaluation as EvaluationDetailResponse)
          ?.status as Record<string, unknown>;
        passed = detailedStatus?.passed as boolean;
      }

      if (filters.passed === "passed" && passed !== true) return false;
      if (filters.passed === "failed" && passed !== false) return false;
      if (
        filters.passed === "unknown" &&
        passed !== null &&
        passed !== undefined
      )
        return false;
    }

    // Score range filter
    if (filters.scoreMin || filters.scoreMax) {
      // Try to get score from basic evaluation first
      let score: string | number | null | undefined = (evaluation as Evaluation)
        .score;

      // If not found, try to get from detailed response status
      if (score === null || score === undefined) {
        const detailedStatus = (evaluation as EvaluationDetailResponse)
          ?.status as Record<string, unknown>;
        score = detailedStatus?.score as string | number;
      }

      if (typeof score === "number") {
        const min = filters.scoreMin ? parseFloat(filters.scoreMin) : 0;
        const max = filters.scoreMax ? parseFloat(filters.scoreMax) : 1;
        if (score < min || score > max) return false;
      } else if (filters.scoreMin || filters.scoreMax) {
        // If score is not a number but we have score filters, exclude it
        return false;
      }
    }

    return true;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedEvaluations = [...filteredEvaluations].sort((a, b) => {
    if (sortField === "name") {
      const aName = a.name || "";
      const bName = b.name || "";
      return sortDirection === "desc"
        ? bName.localeCompare(aName)
        : aName.localeCompare(bName);
    } else if (sortField === "score") {
      // Get scores using the same logic as getScoreDisplay
      let aScore: number = 0;
      let bScore: number = 0;

      // Get aScore as number
      const aScoreRaw = (a as Evaluation).score;
      if (aScoreRaw !== null && aScoreRaw !== undefined) {
        aScore =
          typeof aScoreRaw === "number"
            ? aScoreRaw
            : parseFloat(String(aScoreRaw)) || 0;
      } else {
        const aDetailedStatus = (a as EvaluationDetailResponse)
          ?.status as Record<string, unknown>;
        const aScoreDetailed = aDetailedStatus?.score;
        aScore =
          typeof aScoreDetailed === "number"
            ? aScoreDetailed
            : parseFloat(String(aScoreDetailed)) || 0;
      }

      // Get bScore as number
      const bScoreRaw = (b as Evaluation).score;
      if (bScoreRaw !== null && bScoreRaw !== undefined) {
        bScore =
          typeof bScoreRaw === "number"
            ? bScoreRaw
            : parseFloat(String(bScoreRaw)) || 0;
      } else {
        const bDetailedStatus = (b as EvaluationDetailResponse)
          ?.status as Record<string, unknown>;
        const bScoreDetailed = bDetailedStatus?.score;
        bScore =
          typeof bScoreDetailed === "number"
            ? bScoreDetailed
            : parseFloat(String(bScoreDetailed)) || 0;
      }

      return sortDirection === "desc" ? bScore - aScore : aScore - bScore;
    } else if (sortField === "status") {
      // Get status using the same logic as getStatus
      let aStatus = (a as Evaluation).phase || "pending";
      let bStatus = (b as Evaluation).phase || "pending";

      if (!aStatus || aStatus === "pending") {
        const aDetailedStatus = (a as EvaluationDetailResponse)
          ?.status as Record<string, unknown>;
        aStatus = (aDetailedStatus?.phase as string) || "pending";
      }
      if (!bStatus || bStatus === "pending") {
        const bDetailedStatus = (b as EvaluationDetailResponse)
          ?.status as Record<string, unknown>;
        bStatus = (bDetailedStatus?.phase as string) || "pending";
      }

      return sortDirection === "desc"
        ? bStatus.localeCompare(aStatus)
        : aStatus.localeCompare(bStatus);
    }
    return 0;
  });

  const getStatus = (evaluation: Evaluation | EvaluationDetailResponse) => {
    // Try to get phase from basic evaluation first
    let phase = (evaluation as Evaluation).phase;

    // If not found, try to get from detailed response status
    if (!phase) {
      const detailedStatus = (evaluation as EvaluationDetailResponse)
        ?.status as Record<string, unknown>;
      phase = detailedStatus?.phase as string;
    }

    return phase || "pending";
  };

  const getStatusBadge = (
    status: string | undefined,
    evaluationName: string
  ) => {
    const normalizedStatus = status as
      | "done"
      | "error"
      | "running"
      | "evaluating"
      | "canceled"
      | "default";
    const variant = [
      "done",
      "error",
      "running",
      "evaluating",
      "canceled"
    ].includes(status || "")
      ? normalizedStatus
      : "default";

    return (
      <StatusDot
        variant={variant}
        onCancel={
          status === "running" || status === "evaluating"
            ? () => handleCancel(evaluationName)
            : undefined
        }
      />
    );
  };

  const handleDelete = async (evaluationName: string) => {
    try {
      await evaluationsService.delete(namespace, evaluationName);
      toast({
        variant: "success",
        title: "Evaluation Deleted",
        description: "Successfully deleted evaluation"
      });
      // Reload evaluations
      await loadEvaluations();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Delete Evaluation",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  };

  const handleCancel = async (evaluationName: string) => {
    try {
      await evaluationsService.cancel(namespace, evaluationName);
      toast({
        variant: "success",
        title: "Evaluation Canceled",
        description: "Successfully canceled evaluation"
      });
      // Reload evaluations
      await loadEvaluations();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Cancel Evaluation",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  };

  const handleSaveEvaluation = async (
    evaluation: (EvaluationCreateRequest | EvaluationUpdateRequest) & {
      id?: string;
    }
  ) => {
    try {
      if (evaluation.id) {
        const updateRequest = evaluation as EvaluationUpdateRequest & {
          id: string;
        };
        await evaluationsService.update(
          namespace,
          updateRequest.id,
          updateRequest
        );
        toast({
          variant: "success",
          title: "Evaluation Updated",
          description: "Successfully updated evaluation"
        });
      } else {
        const createRequest = evaluation as EvaluationCreateRequest;
        await evaluationsService.create(namespace, createRequest);
        toast({
          variant: "success",
          title: "Evaluation Created",
          description: "Successfully created evaluation"
        });
      }

      // Reload evaluations
      await loadEvaluations();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Save Evaluation",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  };

  const handleEditEvaluation = (
    evaluation: Evaluation | EvaluationDetailResponse
  ) => {
    setEditingEvaluation(evaluation as Evaluation);
    setEditorOpen(true);
  };

  if (listEvaluationsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const renderEvaluationTable = () => (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <th
                className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center">
                  Name
                  {sortField === "name" &&
                    (sortDirection === "desc" ? (
                      <ChevronDown className="ml-1 h-4 w-4" />
                    ) : (
                      <ChevronUp className="ml-1 h-4 w-4" />
                    ))}
                </div>
              </th>
              <th
                className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center">Age</div>
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                Evaluator
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                Type
              </th>
              {activeTab !== "dataset" && (
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                  Query Ref
                </th>
              )}
              <th
                className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("score")}
              >
                <div className="flex items-center">
                  Score
                  {sortField === "score" &&
                    (sortDirection === "desc" ? (
                      <ChevronDown className="ml-1 h-4 w-4" />
                    ) : (
                      <ChevronUp className="ml-1 h-4 w-4" />
                    ))}
                </div>
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                Passed
              </th>
              <th
                className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center">
                  Status
                  {sortField === "status" &&
                    (sortDirection === "desc" ? (
                      <ChevronDown className="ml-1 h-4 w-4" />
                    ) : (
                      <ChevronUp className="ml-1 h-4 w-4" />
                    ))}
                </div>
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedEvaluations.length === 0 ? (
              <tr>
                <td
                  colSpan={activeTab === "dataset" ? 7 : 8}
                  className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No {activeTab === "dataset" ? "dataset" : "standard"}{" "}
                  evaluations found
                </td>
              </tr>
            ) : (
              sortedEvaluations.map((evaluation) => {
                const status = getStatus(evaluation);
                return (
                  <tr
                    key={evaluation.name}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer"
                    onClick={() => {
                      router.push(
                        `/evaluation/${evaluation.name}?namespace=${namespace}`
                      );
                    }}
                  >
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {evaluation.name}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {formatAge(
                        (evaluation as EvaluationDetailResponse)?.metadata
                          ?.creationTimestamp as string | undefined
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {getEvaluatorDisplay(evaluation)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          activeTab === "dataset"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        }`}
                      >
                        {getTypeDisplay(evaluation)}
                      </span>
                    </td>
                    {activeTab !== "dataset" && (
                      <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {getQueryRefDisplay(evaluation)}
                      </td>
                    )}
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <span className="font-mono">
                        {getScoreDisplay(evaluation)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <span
                        className={`text-lg ${(() => {
                          // Get passed value using the same logic as getPassedDisplay
                          let passed = (evaluation as Evaluation).passed;
                          if (passed === null || passed === undefined) {
                            const detailedStatus = (
                              evaluation as EvaluationDetailResponse
                            )?.status as Record<string, unknown>;
                            passed = detailedStatus?.passed as boolean;
                          }
                          return passed
                            ? "text-green-600"
                            : passed === false
                            ? "text-red-600"
                            : "text-gray-400";
                        })()}`}
                      >
                        {getPassedDisplay(evaluation)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {getStatusBadge(status, evaluation.name)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <div className="flex items-center space-x-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditEvaluation(evaluation);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Edit evaluation</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(evaluation.name);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete evaluation</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="border-b space-y-4 pb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="standard" className="text-sm">
              Standard ({standardEvaluations.length})
            </TabsTrigger>
            <TabsTrigger value="dataset" className="text-sm">
              Baseline ({datasetEvaluations.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex justify-between">
          <div className="flex-1">
            <EvaluationFilter
              filters={filters}
              onFiltersChange={setFilters}
              availableEvaluators={getAvailableEvaluators()}
              availableTypes={getAvailableTypes()}
            />
          </div>

          <Button
            onClick={() => loadEvaluations()}
            disabled={listEvaluationsFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                listEvaluationsFetching ? "animate-spin" : ""
              }`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <main className="flex-1 overflow-auto">
        {listEvaluationsFetching ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-muted-foreground">Refetching...</div>
          </div>
        ) : (
          renderEvaluationTable()
        )}
      </main>

      <EvaluationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        evaluation={editingEvaluation}
        onSave={handleSaveEvaluation}
        namespace={namespace}
      />
    </div>
  );
});
