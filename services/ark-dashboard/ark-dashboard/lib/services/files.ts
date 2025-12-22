import { filesApiClient } from '@/lib/api/files-client';
import type {
  DeleteDirectoryResponse,
  ListFilesParams,
  ListFilesResponse,
} from '@/lib/types/files';

export const filesService = {
  async list(params: ListFilesParams = {}): Promise<ListFilesResponse> {
    const response = await filesApiClient.get<ListFilesResponse>('/files', {
      params: {
        ...(params.prefix !== undefined && { prefix: params.prefix }),
        ...(params.max_keys !== undefined && { max_keys: params.max_keys }),
        ...(params.continuation_token !== undefined && {
          continuation_token: params.continuation_token,
        }),
      },
    });
    return response;
  },

  async upload(
    file: File,
    prefix: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('prefix', prefix);

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      const baseURL =
        process.env.NEXT_PUBLIC_ARK_API_BASE_URL ||
        '/api/v1/proxy/file-gateway-api';
      xhr.open('POST', `${baseURL}/files`);
      xhr.send(formData);
    });
  },

  async delete(key: string): Promise<void> {
    await filesApiClient.delete(`/files/${encodeURIComponent(key)}`);
  },

  download(key: string): void {
    const baseURL =
      process.env.NEXT_PUBLIC_ARK_API_BASE_URL ||
      '/api/v1/proxy/file-gateway-api';
    const url = `${baseURL}/files/${encodeURIComponent(key)}/download`;
    window.open(url, '_blank');
  },

  async deleteDirectory(prefix: string): Promise<DeleteDirectoryResponse> {
    const response = await filesApiClient.delete<DeleteDirectoryResponse>(
      '/directories',
      {
        params: { prefix },
      },
    );
    return response;
  },
};
