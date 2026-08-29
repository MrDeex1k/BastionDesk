import { lazy, Suspense, useCallback, useMemo, useReducer } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminIncidentFiltersResponse,
  AdminIncidentsQueryInput,
  IncidentsResponse,
} from "@/ApiModel";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Loader2,
  Plus,
  ShieldAlert,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { IncidentSummaryItem } from "./incident-list/IncidentSummaryItem";

const IncidentDetails = lazy(() =>
  import("./IncidentDetails").then((module) => ({
    default: module.IncidentDetails,
  })),
);
const IncidentReportForm = lazy(() =>
  import("./IncidentReportForm").then((module) => ({
    default: module.IncidentReportForm,
  })),
);

const LIMIT = 10;

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Wszystkie" },
  { value: "Zgłoszony", label: "Zgłoszony" },
  { value: "Raport w trakcie", label: "Raport w trakcie" },
  { value: "Raport złożony", label: "Raport złożony" },
  { value: "Sprawozdanie w trakcie", label: "Sprawozdanie w trakcie" },
  { value: "Sprawozdanie złożone", label: "Sprawozdanie złożone" },
  { value: "Odrzucone", label: "Odrzucone" },
] as const;

const SORT_BY_OPTIONS = [
  { value: "createdAt", label: "Data utworzenia" },
  { value: "updatedAt", label: "Data aktualizacji" },
  { value: "status", label: "Status" },
  { value: "dataZgloszenia", label: "Data zgłoszenia" },
  { value: "userId", label: "Użytkownik" },
  { value: "analystId", label: "Analityk" },
] as const;

const SORT_ORDER_OPTIONS = [
  { value: "desc", label: "Malejąco" },
  { value: "asc", label: "Rosnąco" },
] as const;

interface AdminIncidentListState {
  page: number;
  selectedIncidentId: string | null;
  statusFilter: string;
  userQuery: string;
  analystFilter: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  showFilters: boolean;
  isCreateDialogOpen: boolean;
}

type AdminIncidentListAction =
  | { type: "set-page"; value: number }
  | { type: "set-selected-incident-id"; value: string | null }
  | { type: "set-status-filter"; value: string }
  | { type: "set-user-query"; value: string }
  | { type: "set-analyst-filter"; value: string }
  | { type: "set-sort-by"; value: string }
  | { type: "set-sort-order"; value: "asc" | "desc" }
  | { type: "set-show-filters"; value: boolean }
  | { type: "set-create-dialog-open"; value: boolean }
  | { type: "clear-filters" };

const initialAdminIncidentListState: AdminIncidentListState = {
  page: 1,
  selectedIncidentId: null,
  statusFilter: "all",
  userQuery: "",
  analystFilter: "all",
  sortBy: "createdAt",
  sortOrder: "desc",
  showFilters: false,
  isCreateDialogOpen: false,
};

function adminIncidentListReducer(
  state: AdminIncidentListState,
  action: AdminIncidentListAction,
): AdminIncidentListState {
  switch (action.type) {
    case "set-page":
      return { ...state, page: action.value };
    case "set-selected-incident-id":
      return { ...state, selectedIncidentId: action.value };
    case "set-status-filter":
      return { ...state, statusFilter: action.value, page: 1 };
    case "set-user-query":
      return { ...state, userQuery: action.value, page: 1 };
    case "set-analyst-filter":
      return { ...state, analystFilter: action.value, page: 1 };
    case "set-sort-by":
      return { ...state, sortBy: action.value, page: 1 };
    case "set-sort-order":
      return { ...state, sortOrder: action.value, page: 1 };
    case "set-show-filters":
      return { ...state, showFilters: action.value };
    case "set-create-dialog-open":
      return { ...state, isCreateDialogOpen: action.value };
    case "clear-filters":
      return {
        ...state,
        page: 1,
        statusFilter: "all",
        userQuery: "",
        analystFilter: "all",
        sortBy: "createdAt",
        sortOrder: "desc",
      };
    default:
      return state;
  }
}

export function AdminIncidentList() {
  const [state, dispatch] = useReducer(adminIncidentListReducer, initialAdminIncidentListState);
  const queryClient = useQueryClient();

  const { data: filtersData } = useQuery<AdminIncidentFiltersResponse>({
    queryKey: ["adminIncidentFilters"],
    queryFn: async () => {
      const response = await apiFetch("/api/admin/incidents/filters");

      if (!response.ok) {
        throw new Error("Failed to fetch incident filters");
      }

      return response.json() as Promise<AdminIncidentFiltersResponse>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const queryInput = useMemo<AdminIncidentsQueryInput>(() => {
    const analystIsSelected = !["all", "unassigned"].includes(state.analystFilter);

    return {
      pagination: {
        page: state.page,
        limit: LIMIT,
      },
      filters: {
        statuses: state.statusFilter === "all" ? undefined : [state.statusFilter],
        search: state.userQuery.trim() || undefined,
        analystIds: analystIsSelected ? [state.analystFilter] : undefined,
        assignment:
          state.analystFilter === "unassigned"
            ? "unassigned"
            : analystIsSelected
              ? "assigned"
              : "all",
      },
      sort: [
        {
          field: state.sortBy as AdminIncidentsQueryInput["sort"][number]["field"],
          direction: state.sortOrder,
        },
      ],
    };
  }, [
    state.analystFilter,
    state.page,
    state.sortBy,
    state.sortOrder,
    state.statusFilter,
    state.userQuery,
  ]);

  const { data, isPending, isFetching, isError, isPlaceholderData } = useQuery<IncidentsResponse>({
    queryKey: ["adminIncidents", queryInput],
    queryFn: async () => {
      const response = await apiFetch("/api/admin/incidents", {
        method: "QUERY",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryInput),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch incidents");
      }

      return response.json() as Promise<IncidentsResponse>;
    },
    placeholderData: keepPreviousData,
  });

  const hasActiveFilters = useMemo(
    () =>
      state.statusFilter !== "all" ||
      state.userQuery !== "" ||
      state.analystFilter !== "all" ||
      state.sortBy !== "createdAt" ||
      state.sortOrder !== "desc",
    [state.analystFilter, state.sortBy, state.sortOrder, state.statusFilter, state.userQuery],
  );

  const handleSelectIncident = useCallback((incidentId: string) => {
    dispatch({ type: "set-selected-incident-id", value: incidentId });
  }, []);

  const handleBackToList = useCallback(() => {
    dispatch({ type: "set-selected-incident-id", value: null });
  }, []);

  const handleCreateDialogChange = useCallback((open: boolean) => {
    dispatch({ type: "set-create-dialog-open", value: open });
  }, []);

  const handleCreateSuccess = useCallback(() => {
    dispatch({ type: "set-create-dialog-open", value: false });
    void queryClient.invalidateQueries({
      queryKey: ["adminIncidents"],
    });
  }, [queryClient]);

  const handleToggleFilters = useCallback(() => {
    dispatch({
      type: "set-show-filters",
      value: !state.showFilters,
    });
  }, [state.showFilters]);

  const handleClearFilters = useCallback(() => {
    dispatch({ type: "clear-filters" });
  }, []);

  const handlePageChange = useCallback((page: number) => {
    dispatch({ type: "set-page", value: page });
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    dispatch({ type: "set-status-filter", value });
  }, []);

  const handleAnalystFilterChange = useCallback((value: string) => {
    dispatch({ type: "set-analyst-filter", value });
  }, []);

  const handleSortByChange = useCallback((value: string) => {
    dispatch({ type: "set-sort-by", value });
  }, []);

  const handleSortOrderChange = useCallback((value: "asc" | "desc") => {
    dispatch({ type: "set-sort-order", value });
  }, []);

  const handleUserQueryChange = useCallback((value: string) => {
    dispatch({ type: "set-user-query", value });
  }, []);

  const analystFilterOptions = useMemo(
    () => [
      { value: "all", label: "Wszyscy" },
      { value: "unassigned", label: "Nieprzypisane" },
      ...(filtersData?.data.analysts.map((analyst) => ({
        value: analyst.id,
        label: analyst.name?.trim() || analyst.email,
      })) ?? []),
    ],
    [filtersData?.data.analysts],
  );

  if (state.selectedIncidentId) {
    return (
      <Suspense fallback={<AdminIncidentDetailsLoader />}>
        <IncidentDetails
          incidentId={state.selectedIncidentId}
          onBack={handleBackToList}
          mode="admin"
        />
      </Suspense>
    );
  }

  return (
    <Card className="flex h-[700px] w-full flex-col animate-in fade-in border-zinc-800 bg-zinc-900/50 shadow-xl duration-300">
      <CardHeader className="border-b border-zinc-800/50">
        <AdminIncidentListHeader
          summary={{
            incidentsCount: data?.data.length ?? 0,
            totalCount: data?.pagination.total ?? 0,
            isLoading: isFetching,
          }}
          createDialog={{
            isOpen: state.isCreateDialogOpen,
            onOpenChange: handleCreateDialogChange,
            onSuccess: handleCreateSuccess,
          }}
          filters={{
            hasActive: hasActiveFilters,
            isVisible: state.showFilters,
            onToggle: handleToggleFilters,
          }}
        />

        {state.showFilters && (
          <AdminIncidentFiltersPanel
            statusFilter={state.statusFilter}
            analystFilter={state.analystFilter}
            sortBy={state.sortBy}
            sortOrder={state.sortOrder}
            userQuery={state.userQuery}
            analystOptions={analystFilterOptions}
            hasActiveFilters={hasActiveFilters}
            onStatusFilterChange={handleStatusFilterChange}
            onAnalystFilterChange={handleAnalystFilterChange}
            onSortByChange={handleSortByChange}
            onSortOrderChange={handleSortOrderChange}
            onUserQueryChange={handleUserQueryChange}
            onClearFilters={handleClearFilters}
          />
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <AdminIncidentResults
          incidents={data?.data ?? []}
          isError={isError}
          isLoading={isPending}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearFilters}
          onSelectIncident={handleSelectIncident}
        />
      </CardContent>

      {data && data.pagination.totalPages > 1 && (
        <AdminIncidentPagination
          page={state.page}
          totalPages={data.pagination.totalPages}
          isLoading={isFetching || isPlaceholderData}
          onPageChange={handlePageChange}
        />
      )}
    </Card>
  );
}

function AdminIncidentListHeader({
  summary,
  createDialog,
  filters,
}: {
  summary: {
    incidentsCount: number;
    totalCount: number;
    isLoading: boolean;
  };
  createDialog: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
  };
  filters: {
    hasActive: boolean;
    isVisible: boolean;
    onToggle: () => void;
  };
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="flex items-center gap-2 text-2xl text-zinc-200">
          <ShieldAlert className="size-6 text-green-400" />
          Wszystkie incydenty w organizacji
          {summary.isLoading && <Loader2 className="size-5 animate-spin text-blue-400" />}
        </CardTitle>
        <p className="mt-1 text-sm text-zinc-500">
          Wyświetlono {summary.incidentsCount} z {summary.totalCount} incydentów
        </p>
      </div>
      <div className="flex gap-2">
        <CreateIncidentDialog
          open={createDialog.isOpen}
          onOpenChange={createDialog.onOpenChange}
          onSuccess={createDialog.onSuccess}
        />

        <Button
          variant={filters.isVisible ? "default" : "outline"}
          size="default"
          onClick={filters.onToggle}
          className={
            filters.isVisible ? "bg-blue-600 hover:bg-blue-700" : "border-zinc-700 text-zinc-300"
          }
        >
          <Filter className="mr-2 size-4" />
          Filtry
          {filters.hasActive && (
            <span className="ml-2 rounded-full bg-blue-500 px-1.5 py-0.5 text-xs text-white">
              ●
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

function CreateIncidentDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-green-600 text-white shadow-lg shadow-green-900/20 hover:bg-green-700" />
        }
      >
        <Plus className="mr-2 size-4" />
        Zgłoś incydent
      </DialogTrigger>
      <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 text-zinc-200">
        <DialogTitle className="sr-only">Zgłoś incydent</DialogTitle>
        <DialogDescription className="sr-only">
          Formularz zgłaszania nowego incydentu bezpieczeństwa.
        </DialogDescription>
        <Suspense fallback={<AdminDialogLoader />}>
          <IncidentReportForm onSuccess={onSuccess} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function AdminIncidentDetailsLoader() {
  return (
    <div className="flex min-h-[420px] w-full items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/50 text-zinc-400">
      Ładowanie szczegółów incydentu…
    </div>
  );
}

function AdminDialogLoader() {
  return (
    <div className="flex min-h-[220px] items-center justify-center text-zinc-400">
      Ładowanie formularza…
    </div>
  );
}

function AdminIncidentFiltersPanel({
  statusFilter,
  analystFilter,
  analystOptions,
  sortBy,
  sortOrder,
  userQuery,
  hasActiveFilters,
  onStatusFilterChange,
  onAnalystFilterChange,
  onSortByChange,
  onSortOrderChange,
  onUserQueryChange,
  onClearFilters,
}: {
  statusFilter: string;
  analystFilter: string;
  analystOptions: ReadonlyArray<{ value: string; label: string }>;
  sortBy: string;
  sortOrder: "asc" | "desc";
  userQuery: string;
  hasActiveFilters: boolean;
  onStatusFilterChange: (value: string) => void;
  onAnalystFilterChange: (value: string) => void;
  onSortByChange: (value: string) => void;
  onSortOrderChange: (value: "asc" | "desc") => void;
  onUserQueryChange: (value: string) => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="mt-4 space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <FilterSelectField
          label="Status"
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onValueChange={onStatusFilterChange}
        />
        <FilterSelectField
          label="Analityk"
          options={analystOptions}
          value={analystFilter}
          onValueChange={onAnalystFilterChange}
        />
        <FilterSelectField
          label="Sortuj po"
          options={SORT_BY_OPTIONS}
          value={sortBy}
          onValueChange={onSortByChange}
        />
        <FilterSelectField
          label="Kolejność"
          options={SORT_ORDER_OPTIONS}
          value={sortOrder}
          onValueChange={(value) => onSortOrderChange(value as "asc" | "desc")}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-zinc-400">Szukaj użytkownika (ID, nazwa lub email)</Label>
        <Input
          placeholder="Wpisz ID użytkownika, nazwę lub email..."
          value={userQuery}
          onChange={(event) => onUserQueryChange(event.target.value)}
          className="border-zinc-700 bg-zinc-900 text-zinc-300"
        />
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X className="mr-2 size-4" />
          Wyczyść filtry
        </Button>
      )}
    </div>
  );
}

function FilterSelectField({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-zinc-400">{label}</Label>
      <Select items={options} value={value} onValueChange={onValueChange}>
        <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-300">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-100">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-white focus:bg-blue-500/20 focus:text-white"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AdminIncidentResults({
  incidents,
  isError,
  isLoading,
  hasActiveFilters,
  onClearFilters,
  onSelectIncident,
}: {
  incidents: IncidentsResponse["data"];
  isError: boolean;
  isLoading: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onSelectIncident: (incidentId: string) => void;
}) {
  return (
    <ScrollArea className="h-full px-6">
      {isError ? (
        <div className="py-8 text-center text-red-400">
          <AlertCircle className="mx-auto mb-4 size-12" />
          <p>Wystąpił błąd podczas pobierania incydentów.</p>
        </div>
      ) : (
        <div className="space-y-3 pb-4 pt-4">
          {incidents.map((incident) => (
            <IncidentSummaryItem
              key={incident.id}
              analystId={incident.analystId}
              analystName={incident.analystName}
              czyRozwiazany={incident.czyRozwiazany}
              dataZgloszenia={incident.dataZgloszenia}
              id={incident.id}
              llmCategory={incident.llmCategory}
              onSelect={onSelectIncident}
              showAnalyst
              showResolved
              status={incident.status}
              userDescription={incident.userDescription}
              userId={incident.userId}
              userName={incident.userName}
            />
          ))}
          {!isLoading && incidents.length === 0 && (
            <div className="py-12 text-center text-zinc-500">
              <FileText className="mx-auto mb-4 size-12 opacity-50" />
              <p className="text-lg">Brak incydentów spełniających kryteria.</p>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearFilters}
                  className="mt-4 text-blue-400 hover:text-blue-300"
                >
                  Wyczyść filtry
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </ScrollArea>
  );
}

function AdminIncidentPagination({
  page,
  totalPages,
  isLoading,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <CardFooter className="justify-between border-t border-zinc-800 p-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(Math.max(page - 1, 1))}
        disabled={page === 1 || isLoading}
        className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
      >
        <ChevronLeft className="mr-1 size-4" />
        Poprzednia
      </Button>
      <span className="text-sm text-zinc-500">
        Strona {page} z {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page < totalPages ? page + 1 : page)}
        disabled={page === totalPages || isLoading}
        className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
      >
        Następna
        <ChevronRight className="ml-1 size-4" />
      </Button>
    </CardFooter>
  );
}
