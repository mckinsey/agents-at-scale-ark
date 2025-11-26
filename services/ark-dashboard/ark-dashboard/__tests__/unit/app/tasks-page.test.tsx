import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

import TasksPage from '@/app/(dashboard)/tasks/page';
import { SidebarProvider } from '@/components/ui/sidebar';

vi.mock('@/lib/services/a2a-tasks-hooks', () => ({
    useListA2ATasks: vi.fn(() => ({
        data: {
            items: [],
            count: 0,
        },
        isPending: false,
        error: null,
    })),
    useDeleteA2ATask: vi.fn(() => ({
        mutateAsync: vi.fn(),
        isPending: false,
    })),
}));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

describe('TasksPage', () => {
    it('should render the page header with title', () => {
        render(
            <QueryClientProvider client={queryClient}>
                <JotaiProvider>
                    <SidebarProvider>
                        <TasksPage />
                    </SidebarProvider>
                </JotaiProvider>
            </QueryClientProvider>,
        );

        const titles = screen.getAllByText('A2A Tasks');
        expect(titles.length).toBeGreaterThan(0);
    });

    it('should render the A2ATasksSection component', () => {
        render(
            <QueryClientProvider client={queryClient}>
                <JotaiProvider>
                    <SidebarProvider>
                        <TasksPage />
                    </SidebarProvider>
                </JotaiProvider>
            </QueryClientProvider>,
        );

        expect(screen.getByText('No A2A Tasks Found')).toBeInTheDocument();
    });
});
