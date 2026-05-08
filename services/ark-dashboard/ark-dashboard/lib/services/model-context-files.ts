const PROVIDER = 'openai';

export const MODEL_CONTEXT_FILES_API_BASE_URL =
  process.env.NEXT_PUBLIC_MODEL_CONTEXT_FILES_API_URL ||
  `/api/v1/files/model-context/${PROVIDER}`;

export interface ModelContextFile {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  status: string;
  provider?: string;
}

interface ListResponse {
  data: ModelContextFile[];
  object: 'list';
}

async function ensureOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  let detail = fallback;
  try {
    const body = await res.json();
    if (body?.error) detail = body.error;
  } catch {
    // body was not JSON; use fallback
  }
  throw new Error(detail);
}

export const modelContextFilesService = {
  async list(): Promise<ModelContextFile[]> {
    const res = await fetch(MODEL_CONTEXT_FILES_API_BASE_URL);
    await ensureOk(res, 'Failed to list files');
    const data: ListResponse = await res.json();
    return data.data || [];
  },

  async upload(
    file: File,
    purpose: string = 'user_data',
  ): Promise<ModelContextFile> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('purpose', purpose);
    const res = await fetch(MODEL_CONTEXT_FILES_API_BASE_URL, {
      method: 'POST',
      body: fd,
    });
    await ensureOk(res, `Failed to upload ${file.name}`);
    return res.json();
  },

  async delete(fileId: string): Promise<void> {
    const res = await fetch(
      `${MODEL_CONTEXT_FILES_API_BASE_URL}/${encodeURIComponent(fileId)}`,
      { method: 'DELETE' },
    );
    await ensureOk(res, `Failed to delete ${fileId}`);
  },
};
