export interface FileItem {
  key: string;
  size: number;
  last_modified: string;
  etag: string;
}

export interface DirectoryItem {
  prefix: string;
}

export interface ListFilesParams {
  prefix?: string;
  max_keys?: number;
  continuation_token?: string;
}

export interface ListFilesResponse {
  files: FileItem[];
  directories: DirectoryItem[];
  next_token?: string;
}

export interface DeleteDirectoryResponse {
  deleted_count: number;
}
