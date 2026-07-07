'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Autorenew, DatabaseSearch } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { QueriesSection } from '@/components/sections/queries-section';
import {
  ResourceEmptyState,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Pagination } from '@/components/ui/pagination';
import { useListQueries } from '@/lib/services/queries-hooks';
import {
  DEFAULT_PAGE_SIZE,
  parsePage,
  parsePageSize,
} from '@/lib/utils/pagination';

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];
const SEARCH_DEBOUNCE_MS = 400;
const QUERY_DOCS_URL =
  'https://mckinsey.github.io/agents-at-scale-ark/user-guide/queries/';

export default function QueriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = parsePage(searchParams.get('page'));
  const pageSize = parsePageSize(searchParams.get('pageSize'));
  const urlSearch = searchParams.get('q') ?? '';

  const [searchInput, setSearchInput] = useState<string>(urlSearch);

  const queriesQuery = useListQueries({
    page,
    pageSize,
    search: urlSearch || undefined,
  });

  const { data, isLoading, isFetching, isError, refetch } = queriesQuery;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isEmpty = !isLoading && !isError && total === 0 && !urlSearch;

  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const updateParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router],
  );

  useEffect(() => {
    if (searchInput === urlSearch) return;
    const t = setTimeout(() => {
      updateParams({ q: searchInput || null, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, urlSearch, updateParams]);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (total === 0) return;
    if (page > totalPages) {
      updateParams({ page: null });
    }
  }, [page, total, totalPages, updateParams]);

  const handlePageChange = (next: number) => {
    updateParams({ page: next === 1 ? null : String(next) });
  };

  const handlePageSizeChange = (next: number) => {
    updateParams({
      pageSize: next === DEFAULT_PAGE_SIZE ? null : String(next),
      page: null,
    });
  };

  const handleClearSearch = () => {
    setSearchInput('');
    updateParams({ q: null, page: null });
  };

  return (
    <div className="flex min-h-0 w-full content-shell flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <IconShell size="default" variant="primary">
              <DatabaseSearch />
            </IconShell>
            <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
              {total > 0 ? `Query logs (${total})` : 'Query logs'}
            </h1>
          </div>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            Monitor query activity, execution time, status, and errors
          </p>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </div>

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
          actions={
            <a href={QUERY_DOCS_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">Learn more</Button>
            </a>
          }
        />
      ) : (
        <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
          <div className="flex flex-none items-center">
            <ResourceSearchInput
              value={searchInput}
              onChange={setSearchInput}
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
