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

function buildUrl(suffix: string, agentName?: string): string {
  const url = `${MODEL_CONTEXT_FILES_API_BASE_URL}${suffix}`;
  if (!agentName) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}agent=${encodeURIComponent(agentName)}`;
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
  async list(agentName?: string): Promise<ModelContextFile[]> {
    const res = await fetch(buildUrl('', agentName));
    await ensureOk(res, 'Failed to list files');
    const data: ListResponse = await res.json();
    return data.data || [];
  },

  async upload(
    file: File,
    options?: { agentName?: string; purpose?: string },
  ): Promise<ModelContextFile> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('purpose', options?.purpose ?? 'user_data');
    const res = await fetch(buildUrl('', options?.agentName), {
      method: 'POST',
      body: fd,
    });
    await ensureOk(res, `Failed to upload ${file.name}`);
    return res.json();
  },

  async delete(fileId: string, agentName?: string): Promise<void> {
    const res = await fetch(
      buildUrl(`/${encodeURIComponent(fileId)}`, agentName),
      { method: 'DELETE' },
    );
    await ensureOk(res, `Failed to delete ${fileId}`);
  },
};
