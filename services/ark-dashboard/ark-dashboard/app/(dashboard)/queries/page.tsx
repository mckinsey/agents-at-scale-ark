'use client';

import { useEffect } from 'react';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { Autorenew, DatabaseSearch } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { QueriesSection } from '@/components/sections/queries-section';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Pagination } from '@/components/ui/pagination';
import { DOCS_URLS } from '@/lib/constants/docs';
import { SEARCH_DEBOUNCE_MS, useUrlState } from '@/lib/hooks/use-url-state';
import { useListQueries } from '@/lib/services/queries-hooks';
import {
  DEFAULT_PAGE_SIZE,
  parsePage,
  parsePageSize,
} from '@/lib/utils/pagination';

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];

const URL_STATE_SPEC = {
  q: { default: '', debounceMs: SEARCH_DEBOUNCE_MS },
  page: { default: 1, parse: parsePage },
  pageSize: { default: DEFAULT_PAGE_SIZE, parse: parsePageSize },
};

export default function QueriesPage() {
  const [urlState, setUrlState, committedState] = useUrlState(URL_STATE_SPEC);

  const page = urlState.page;
  const pageSize = urlState.pageSize;
  const urlSearch = committedState.q;

  const queriesQuery = useListQueries({
    page,
    pageSize,
    search: urlSearch || undefined,
  });

  const { data, isLoading, isFetching, isError, refetch } = queriesQuery;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isEmpty = !isLoading && !isError && total === 0 && !urlSearch;

  useEffect(() => {
    if (!data) return;
    if (page > totalPages) {
      setUrlState({ page: 1 });
    }
  }, [data, page, totalPages, setUrlState]);

  const handlePageChange = (next: number) => {
    setUrlState({ page: next });
  };

  const handlePageSizeChange = (next: number) => {
    setUrlState({ pageSize: next });
  };

  const handleClearSearch = () => {
    setUrlState({ q: '' }, { flush: true });
  };

  return (
    <div className="flex min-h-0 w-full content-shell flex-1 flex-col">
      <ResourcePageHeader
        icon={<DatabaseSearch />}
        title={total > 0 ? `Query logs (${total})` : 'Query logs'}
        description="Monitor query activity, execution time, status, and errors"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}>
              <IconShell size="sm">
                <Autorenew />
              </IconShell>
              Refresh
            </Button>
            <NamespacedLink href="/query/new">
              <Button>Create query</Button>
            </NamespacedLink>
          </>
        }
      />

      {isEmpty ? (
        <ResourceEmptyState
          icon={<DatabaseSearch />}
          title="No queries yet"
          description={
            <>
              <p>You haven&apos;t created any query yet.</p>
              <p>Get started by creating your query to see results.</p>
            </>
          }
          actions={<LearnMoreButton href={DOCS_URLS.queries} />}
        />
      ) : (
        <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
          <div className="flex flex-none items-center">
            <ResourceSearchInput
              value={urlState.q}
              onChange={q => setUrlState({ q })}
              placeholder="Search query text..."
              className="w-[493px]"
            />
          </div>

          <QueriesSection
            searchTerm={urlSearch}
            onClearSearch={handleClearSearch}
            queryResult={queriesQuery}
          />

          {total > pageSize && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              itemsPerPage={pageSize}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handlePageSizeChange}
              itemsPerPageOptions={PAGE_SIZE_OPTIONS}
            />
          )}
        </div>
      )}
    </div>
  );
}
