import { Label } from '@radix-ui/react-label';

import { Input } from '../ui/input';

function HttpFields({
  url,
  setUrl,
}: {
  url: string;
  setUrl: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="http-url">URL</Label>
      <Input
        id="http-url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="e.g., https://api.example.com"
      />
    </div>
  );
}

export { HttpFields };
