'use client';

import { Plus, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { QueriesSection } from '@/components/sections/queries-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useListQueries } from '@/lib/services/queries-hooks';

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const SEARCH_DEBOUNCE_MS = 400;

function parsePage(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parsePageSize(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : DEFAULT_PAGE_SIZE;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, 100);
}

export default function QueriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queriesSectionRef = useRef<{ openAddEditor: () => void }>(null);

  const page = parsePage(searchParams.get('page'));
  const pageSize = parsePageSize(searchParams.get('pageSize'));
  const urlSearch = searchParams.get('q') ?? '';

  const [searchInput, setSearchInput] = useState<string>(urlSearch);

  const { data } = useListQueries({
    page,
    pageSize,
    search: urlSearch || undefined,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageTitle = data ? `Queries (${total})` : 'Queries';

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
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Queries"
        actions={
          <Button onClick={() => queriesSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Create Query
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between">
          <h1 className="text-xl">{pageTitle}</h1>
          <div className="relative w-[300px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search query text..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <QueriesSection
          ref={queriesSectionRef}
          searchTerm={urlSearch}
          onClearSearch={handleClearSearch}
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
    </>
  );
}
