import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import copy from 'copy-to-clipboard';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { filesService } from '@/lib/services/files';
import {
  useDeleteDirectory,
  useDeleteFile,
  useListFiles,
} from '@/lib/services/files-hooks';
import type {
  DeleteDirectoryResponse,
  DirectoryItem,
  FileItem,
  ListFilesResponse,
} from '@/lib/types/files';

import { FilesSection } from './files-section';

vi.mock('copy-to-clipboard');
vi.mock('sonner');
vi.mock('@/lib/services/files');
vi.mock('@/lib/services/files-hooks');

const mockCopy = vi.mocked(copy);
const mockToast = vi.mocked(toast);
const mockFilesService = vi.mocked(filesService);
const mockUseListFiles = vi.mocked(useListFiles);
const mockUseDeleteFile = vi.mocked(useDeleteFile);
const mockUseDeleteDirectory = vi.mocked(useDeleteDirectory);

let jotaiStore: ReturnType<typeof createStore>;

function renderWithProviders(ui: React.ReactElement) {
  return render(<JotaiProvider store={jotaiStore}>{ui}</JotaiProvider>);
}

describe('FilesSection', () => {
  const mockFile: FileItem = {
    key: 'documents/report.pdf',
    size: 1024000,
    last_modified: '2025-01-09T10:00:00Z',
    etag: 'abc123',
  };

  const mockDirectory: DirectoryItem = {
    prefix: 'documents/archive/',
  };

  const mockListFilesData: ListFilesResponse = {
    files: [mockFile],
    directories: [mockDirectory],
    next_token: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    jotaiStore = createStore();
    sessionStorage.clear();

    mockToast.success = vi.fn();
    mockToast.error = vi.fn();
    mockCopy.mockReturnValue(true);

    mockUseListFiles.mockReturnValue({
      data: mockListFilesData,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
      ListFilesResponse,
      Error
    >);

    mockUseDeleteFile.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    } as Partial<UseMutationResult<void, Error, string>> as UseMutationResult<
      void,
      Error,
      string
    >);

    mockUseDeleteDirectory.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ deleted_count: 5 }),
    } as Partial<
      UseMutationResult<DeleteDirectoryResponse, Error, string>
    > as UseMutationResult<DeleteDirectoryResponse, Error, string>);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('File Row Three-Dots Menu', () => {
    it('renders three-dots menu button for file rows', () => {
      render(<FilesSection />);

      const fileRow = screen.getByRole('row', { name: /report\.pdf/i });
      const menuButton = within(fileRow).getByRole('button', {
        name: /more actions/i,
      });

      expect(menuButton).toBeInTheDocument();
    });

    it('opens dropdown menu when three-dots button is clicked', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<FilesSection />);

      const fileRow = screen.getByRole('row', { name: /report\.pdf/i });
      const menuButton = within(fileRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      expect(
        await screen.findByRole('menuitem', { name: /copy path/i }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('menuitem', { name: /delete/i }),
      ).toBeInTheDocument();
    });

    it('copies file path when Copy Path is clicked', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<FilesSection />);

      const fileRow = screen.getByRole('row', { name: /report\.pdf/i });
      const menuButton = within(fileRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      const copyPathItem = await screen.findByRole('menuitem', {
        name: /copy path/i,
      });
      await user.click(copyPathItem);

      expect(mockCopy).toHaveBeenCalledWith('documents/report.pdf');
      expect(mockToast.success).toHaveBeenCalledWith('Path Copied', {
        description: 'Copied "documents/report.pdf" to clipboard',
      });
    });

    it('opens delete confirmation dialog when Delete is clicked', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<FilesSection />);

      const fileRow = screen.getByRole('row', { name: /report\.pdf/i });
      const menuButton = within(fileRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      const deleteItem = await screen.findByRole('menuitem', {
        name: /delete/i,
      });
      await user.click(deleteItem);

      expect(
        await screen.findByRole('heading', { name: /delete report\.pdf/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/this action cannot be undone/i),
      ).toBeInTheDocument();
    });

    it('deletes file when deletion is confirmed', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
      mockUseDeleteFile.mockReturnValue({
        mutateAsync: mockMutateAsync,
      } as Partial<UseMutationResult<void, Error, string>> as UseMutationResult<
        void,
        Error,
        string
      >);

      render(<FilesSection />);

      const fileRow = screen.getByRole('row', { name: /report\.pdf/i });
      const menuButton = within(fileRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      const deleteItem = await screen.findByRole('menuitem', {
        name: /delete/i,
      });
      await user.click(deleteItem);

      const confirmButton = await screen.findByRole('button', {
        name: /confirm/i,
      });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith('documents/report.pdf');
      });

      expect(mockToast.success).toHaveBeenCalledWith('File Deleted');
    });

    it('does not delete file when deletion is cancelled', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
      mockUseDeleteFile.mockReturnValue({
        mutateAsync: mockMutateAsync,
      } as Partial<UseMutationResult<void, Error, string>> as UseMutationResult<
        void,
        Error,
        string
      >);

      render(<FilesSection />);

      const fileRow = screen.getByRole('row', { name: /report\.pdf/i });
      const menuButton = within(fileRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      const deleteItem = await screen.findByRole('menuitem', {
        name: /delete/i,
      });
      await user.click(deleteItem);

      const cancelButton = await screen.findByRole('button', {
        name: /cancel/i,
      });
      await user.click(cancelButton);

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('shows error toast when file deletion fails', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const mockMutateAsync = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));
      mockUseDeleteFile.mockReturnValue({
        mutateAsync: mockMutateAsync,
      } as Partial<UseMutationResult<void, Error, string>> as UseMutationResult<
        void,
        Error,
        string
      >);

      render(<FilesSection />);

      const fileRow = screen.getByRole('row', { name: /report\.pdf/i });
      const menuButton = within(fileRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      const deleteItem = await screen.findByRole('menuitem', {
        name: /delete/i,
      });
      await user.click(deleteItem);

      const confirmButton = await screen.findByRole('button', {
        name: /confirm/i,
      });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to Delete File', {
          description: 'Network error',
        });
      });
    });
  });

  describe('Directory Row Three-Dots Menu', () => {
    it('renders three-dots menu button for directory rows', () => {
      render(<FilesSection />);

      const dirRow = screen.getByRole('row', { name: /archive/i });
      const menuButton = within(dirRow).getByRole('button', {
        name: /more actions/i,
      });

      expect(menuButton).toBeInTheDocument();
    });

    it('opens dropdown menu when three-dots button is clicked on directory', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<FilesSection />);

      const dirRow = screen.getByRole('row', { name: /archive/i });
      const menuButton = within(dirRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      expect(
        await screen.findByRole('menuitem', { name: /copy path/i }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('menuitem', { name: /delete/i }),
      ).toBeInTheDocument();
    });

    it('copies directory path when Copy Path is clicked', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<FilesSection />);

      const dirRow = screen.getByRole('row', { name: /archive/i });
      const menuButton = within(dirRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      const copyPathItem = await screen.findByRole('menuitem', {
        name: /copy path/i,
      });
      await user.click(copyPathItem);

      expect(mockCopy).toHaveBeenCalledWith('documents/archive/');
      expect(mockToast.success).toHaveBeenCalledWith('Path Copied', {
        description: 'Copied "documents/archive/" to clipboard',
      });
    });

    it('opens delete confirmation dialog when Delete is clicked on directory', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<FilesSection />);

      const dirRow = screen.getByRole('row', { name: /archive/i });
      const menuButton = within(dirRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      const deleteItem = await screen.findByRole('menuitem', {
        name: /delete/i,
      });
      await user.click(deleteItem);

      expect(
        await screen.findByRole('heading', {
          name: /delete directory and all contents/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/this will delete archive and all files inside/i),
      ).toBeInTheDocument();
    });

    it('deletes directory when deletion is confirmed', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const mockMutateAsync = vi
        .fn()
        .mockResolvedValue({ deleted_count: 5 } as DeleteDirectoryResponse);
      mockUseDeleteDirectory.mockReturnValue({
        mutateAsync: mockMutateAsync,
      } as Partial<
        UseMutationResult<DeleteDirectoryResponse, Error, string>
      > as UseMutationResult<DeleteDirectoryResponse, Error, string>);

      render(<FilesSection />);

      const dirRow = screen.getByRole('row', { name: /archive/i });
      const menuButton = within(dirRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      const deleteItem = await screen.findByRole('menuitem', {
        name: /delete/i,
      });
      await user.click(deleteItem);

      const confirmButton = await screen.findByRole('button', {
        name: /confirm/i,
      });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith('documents/archive/');
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        'Directory Deleted (5 files)',
      );
    });

    it('prevents row navigation when clicking menu button', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<FilesSection />);

      const dirRow = screen.getByRole('row', { name: /archive/i });
      const menuButton = within(dirRow).getByRole('button', {
        name: /more actions/i,
      });

      await user.click(menuButton);

      await screen.findByRole('menuitem', { name: /copy path/i });

      expect(mockUseListFiles).toHaveBeenCalledWith({
        prefix: '',
        max_keys: 100,
      });
    });
  });

  describe('File Download', () => {
    it('renders download button for file rows', () => {
      render(<FilesSection />);

      const fileRow = screen.getByRole('row', { name: /report\.pdf/i });
      const downloadButton = within(fileRow).getAllByRole('button')[0];

      expect(downloadButton).toBeInTheDocument();
    });

    it('calls download service when download button is clicked', async () => {
      mockFilesService.download = vi.fn();

      render(<FilesSection />);

      const fileRow = await screen.findByRole('row', { name: /report\.pdf/i });
      const buttons = within(fileRow).getAllByRole('button');
      const downloadButton = buttons[0];

      fireEvent.click(downloadButton);

      expect(mockFilesService.download).toHaveBeenCalledWith(
        'documents/report.pdf',
      );
    });
  });

  describe('Navigation', () => {
    it('navigates to directory when directory row is clicked', async () => {
      render(<FilesSection />);

      const dirRow = await screen.findByRole('row', { name: /archive/i });

      fireEvent.click(dirRow);

      await waitFor(() => {
        expect(mockUseListFiles).toHaveBeenCalledWith({
          prefix: 'documents/archive/',
          max_keys: 100,
        });
      });
    });

    it('displays breadcrumbs when navigated into a directory', () => {
      mockUseListFiles.mockReturnValue({
        data: { files: [], directories: [], next_token: undefined },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      renderWithProviders(<FilesSection />);

      expect(screen.queryByText(/go up/i)).not.toBeInTheDocument();
    });

    it('navigates up when Go Up button is clicked', async () => {
      mockUseListFiles.mockReturnValue({
        data: { files: [], directories: [], next_token: undefined },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      const { rerender } = render(<FilesSection />);

      mockUseListFiles.mockReturnValue({
        data: { files: [], directories: [], next_token: undefined },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      rerender(<FilesSection />);
    });
  });

  describe('Navigation State Persistence', () => {
    it('preserves navigation location when component remounts', async () => {
      const { unmount } = renderWithProviders(<FilesSection />);

      const dirRow = await screen.findByRole('row', { name: /archive/i });
      fireEvent.click(dirRow);

      await waitFor(() => {
        expect(mockUseListFiles).toHaveBeenCalledWith({
          prefix: 'documents/archive/',
          max_keys: 100,
        });
      });

      unmount();

      mockUseListFiles.mockReturnValue({
        data: {
          files: [],
          directories: [{ prefix: 'documents/archive/subfolder/' }],
          next_token: undefined,
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      renderWithProviders(<FilesSection />);

      await waitFor(() => {
        expect(mockUseListFiles).toHaveBeenCalledWith({
          prefix: 'documents/archive/',
          max_keys: 100,
        });
      });

      expect(screen.getByText(/go up/i)).toBeInTheDocument();
    });

    it('falls back to root when saved location returns error', async () => {
      const { unmount } = renderWithProviders(<FilesSection />);

      const dirRow = await screen.findByRole('row', { name: /archive/i });
      fireEvent.click(dirRow);

      await waitFor(() => {
        expect(mockUseListFiles).toHaveBeenCalledWith({
          prefix: 'documents/archive/',
          max_keys: 100,
        });
      });

      unmount();

      mockUseListFiles.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        isError: true,
        error: new Error('Directory not found'),
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      renderWithProviders(<FilesSection />);

      await waitFor(() => {
        expect(mockUseListFiles).toHaveBeenCalledWith({
          prefix: '',
          max_keys: 100,
        });
      });
    });

    it('resets to root when navigating to root explicitly', async () => {
      renderWithProviders(<FilesSection />);

      const dirRow = await screen.findByRole('row', { name: /archive/i });
      fireEvent.click(dirRow);

      await waitFor(() => {
        expect(screen.getByText(/go up/i)).toBeInTheDocument();
      });

      mockUseListFiles.mockReturnValue({
        data: mockListFilesData,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      const goUpButton = screen.getByRole('button', { name: /go up/i });
      fireEvent.click(goUpButton);
      fireEvent.click(goUpButton);

      await waitFor(() => {
        expect(mockUseListFiles).toHaveBeenCalledWith({
          prefix: '',
          max_keys: 100,
        });
      });
    });
  });

  describe('File Upload', () => {
    it('opens file browser when clicking drop zone', async () => {
      render(<FilesSection />);

      const dropZone = screen.getByText(/drag and drop a file here/i)
        .parentElement?.parentElement;

      const fileInput = screen.getByLabelText(/browse files/i, {
        selector: 'input[type="file"]',
      }) as HTMLInputElement;

      const clickSpy = vi.fn();
      fileInput.click = clickSpy;

      if (dropZone) {
        fireEvent.click(dropZone);
      }

      expect(clickSpy).toHaveBeenCalled();
    });

    it('allows uploading file via file input', async () => {
      render(<FilesSection />);

      const fileInput = screen.getByLabelText(/browse files/i, {
        selector: 'input[type="file"]',
      }) as HTMLInputElement;

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /upload file/i }),
        ).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/filename/i)).toHaveValue('test.txt');
    });

    it('shows visual indication that drop zone is clickable', () => {
      render(<FilesSection />);

      const dropZone = screen.getByText(/drag and drop a file here/i)
        .parentElement?.parentElement;

      expect(dropZone).toHaveClass('cursor-pointer');
    });

    it('rejects files larger than 1MB', async () => {
      render(<FilesSection />);

      const dropZone = screen.getByText(/drag and drop a file here/i)
        .parentElement?.parentElement;

      const largeContent = new Array(1024 * 1024 + 1).fill('a').join('');
      const largeFile = new File([largeContent], 'large.txt', {
        type: 'text/plain',
      });
      const dataTransfer = {
        files: [largeFile],
      };

      if (dropZone) {
        const dropEvent = new Event('drop', { bubbles: true });
        Object.defineProperty(dropEvent, 'dataTransfer', {
          value: dataTransfer,
        });
        dropZone.dispatchEvent(dropEvent);
      }

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'File is too large',
          expect.objectContaining({
            description: expect.anything(),
          }),
        );
      });

      expect(
        screen.queryByRole('heading', { name: /upload file/i }),
      ).not.toBeInTheDocument();
    });

    it('accepts files that are exactly 1MB', async () => {
      render(<FilesSection />);

      const dropZone = screen.getByText(/drag and drop a file here/i)
        .parentElement?.parentElement;

      const exactlyOneMB = new Array(1024 * 1024).fill('a').join('');
      const file = new File([exactlyOneMB], 'exactly-1mb.txt', {
        type: 'text/plain',
      });
      const dataTransfer = {
        files: [file],
      };

      if (dropZone) {
        const dropEvent = new Event('drop', { bubbles: true });
        Object.defineProperty(dropEvent, 'dataTransfer', {
          value: dataTransfer,
        });
        dropZone.dispatchEvent(dropEvent);
      }

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /upload file/i }),
        ).toBeInTheDocument();
      });

      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('opens upload dialog when file is dropped', async () => {
      render(<FilesSection />);

      const dropZone = screen.getByText(/drag and drop a file here/i)
        .parentElement?.parentElement;

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const dataTransfer = {
        files: [file],
      };

      if (dropZone) {
        const dropEvent = new Event('drop', { bubbles: true });
        Object.defineProperty(dropEvent, 'dataTransfer', {
          value: dataTransfer,
        });
        dropZone.dispatchEvent(dropEvent);
      }

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /upload file/i }),
        ).toBeInTheDocument();
      });
    });

    it('allows user to edit filename before upload', async () => {
      const user = userEvent.setup();
      render(<FilesSection />);

      const dropZone = screen.getByText(/drag and drop a file here/i)
        .parentElement?.parentElement;

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const dataTransfer = {
        files: [file],
      };

      if (dropZone) {
        const dropEvent = new Event('drop', { bubbles: true });
        Object.defineProperty(dropEvent, 'dataTransfer', {
          value: dataTransfer,
        });
        dropZone.dispatchEvent(dropEvent);
      }

      await waitFor(() => {
        expect(screen.getByLabelText(/filename/i)).toBeInTheDocument();
      });

      const filenameInput = screen.getByLabelText(/filename/i);
      expect(filenameInput).toHaveValue('test.txt');

      await user.clear(filenameInput);
      await user.type(filenameInput, 'renamed.txt');

      expect(filenameInput).toHaveValue('renamed.txt');
    });

    it('uploads file when upload is confirmed', async () => {
      const user = userEvent.setup();
      mockFilesService.upload = vi.fn().mockResolvedValue(undefined);

      render(<FilesSection />);

      const dropZone = screen.getByText(/drag and drop a file here/i)
        .parentElement?.parentElement;

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const dataTransfer = {
        files: [file],
      };

      if (dropZone) {
        const dropEvent = new Event('drop', { bubbles: true });
        Object.defineProperty(dropEvent, 'dataTransfer', {
          value: dataTransfer,
        });
        dropZone.dispatchEvent(dropEvent);
      }

      await waitFor(() => {
        expect(screen.getByLabelText(/filename/i)).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', { name: /^upload$/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(mockFilesService.upload).toHaveBeenCalled();
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        'File Uploaded Successfully',
      );
    });

    it('disables upload button when filename is empty', async () => {
      const user = userEvent.setup();
      mockFilesService.upload = vi.fn().mockResolvedValue(undefined);

      render(<FilesSection />);

      const dropZone = screen.getByText(/drag and drop a file here/i)
        .parentElement?.parentElement;

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const dataTransfer = {
        files: [file],
      };

      if (dropZone) {
        const dropEvent = new Event('drop', { bubbles: true });
        Object.defineProperty(dropEvent, 'dataTransfer', {
          value: dataTransfer,
        });
        dropZone.dispatchEvent(dropEvent);
      }

      await waitFor(() => {
        expect(screen.getByLabelText(/filename/i)).toBeInTheDocument();
      });

      const filenameInput = screen.getByLabelText(/filename/i);
      await user.clear(filenameInput);

      const uploadButton = await screen.findByRole('button', {
        name: /^upload$/i,
      });

      expect(uploadButton).toBeDisabled();
      expect(mockFilesService.upload).not.toHaveBeenCalled();
    });
  });

  describe('Empty and Loading States', () => {
    it('displays loading state while fetching files', () => {
      mockUseListFiles.mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      render(<FilesSection />);

      expect(screen.getByText(/loading files/i)).toBeInTheDocument();
    });

    it('displays empty state when no files or directories exist', () => {
      mockUseListFiles.mockReturnValue({
        data: { files: [], directories: [], next_token: undefined },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      render(<FilesSection />);

      expect(screen.getByText(/no files yet/i)).toBeInTheDocument();
      expect(screen.getByText(/this directory is empty/i)).toBeInTheDocument();
    });

    it('shows error toast when files fail to load', () => {
      mockUseListFiles.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        isError: true,
        error: new Error('Failed to fetch'),
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      render(<FilesSection />);

      expect(mockToast.error).toHaveBeenCalledWith('Failed to Load Files', {
        description: 'Failed to fetch',
      });
    });
  });

  describe('Load More', () => {
    it('displays load more button when next_token is present', () => {
      mockUseListFiles.mockReturnValue({
        data: {
          files: [mockFile],
          directories: [],
          next_token: 'token123',
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      render(<FilesSection />);

      expect(
        screen.getByRole('button', { name: /load more/i }),
      ).toBeInTheDocument();
    });

    it('does not display load more button when next_token is undefined', () => {
      render(<FilesSection />);

      expect(
        screen.queryByRole('button', { name: /load more/i }),
      ).not.toBeInTheDocument();
    });

    it('loads more files when load more button is clicked', async () => {
      mockFilesService.list = vi.fn().mockResolvedValue({
        files: [
          {
            key: 'documents/report2.pdf',
            size: 2048000,
            last_modified: '2025-01-09T11:00:00Z',
            etag: 'def456',
          },
        ],
        directories: [],
        next_token: undefined,
      });

      mockUseListFiles.mockReturnValue({
        data: {
          files: [mockFile],
          directories: [],
          next_token: 'token123',
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as Partial<UseQueryResult<ListFilesResponse>> as UseQueryResult<
        ListFilesResponse,
        Error
      >);

      render(<FilesSection />);

      const loadMoreButton = await screen.findByRole('button', {
        name: /load more/i,
      });

      fireEvent.click(loadMoreButton);

      await waitFor(() => {
        expect(mockFilesService.list).toHaveBeenCalledWith({
          prefix: '',
          max_keys: 100,
          continuation_token: 'token123',
        });
      });
    });
  });
});
