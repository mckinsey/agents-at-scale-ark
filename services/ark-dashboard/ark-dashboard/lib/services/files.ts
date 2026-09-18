import { filesApiClient } from '@/lib/api/files-client';
import type {
  DeleteDirectoryResponse,
  ListFilesParams,
  ListFilesResponse,
} from '@/lib/types/files';

export const filesService = {
  async list(
    namespace: string,
    params: ListFilesParams = {},
  ): Promise<ListFilesResponse> {
    const response = await filesApiClient.get<ListFilesResponse>('files', {
      params: {
        namespace,
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
    namespace: string,
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

      xhr.open('POST', filesApiClient.buildUrl('files', { namespace }));
      xhr.send(formData);
    });
  },

  async delete(namespace: string, key: string): Promise<void> {
    await filesApiClient.delete(`files/${encodeURIComponent(key)}`, {
      params: { namespace },
    });
  },

  download(namespace: string, key: string): void {
    const url = filesApiClient.buildUrl(
      `files/${encodeURIComponent(key)}/download`,
      { namespace },
    );
    // Save rather than navigate: backstops ark-api's attachment header (stored XSS) and avoids window.open's stranded tab.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = key.split('/').pop() || 'download';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  },

  async deleteDirectory(
    namespace: string,
    prefix: string,
  ): Promise<DeleteDirectoryResponse> {
    const response = await filesApiClient.delete<DeleteDirectoryResponse>(
      'directories',
      {
        params: { namespace, prefix },
      },
    );
    return response;
  },
};
