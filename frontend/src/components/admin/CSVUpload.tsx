import { useState } from 'react';

export default function CSVUpload({ onSubmit }: { onSubmit: (rows: Array<{ email: string; name?: string; teamId?: string }>) => void }) {
  const [text, setText] = useState('email,name,teamId');

  const parse = () => {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const rows = lines.slice(1).map((line) => {
      const [email, name, teamId] = line.split(',');
      return { email: (email || '').trim(), name: (name || '').trim(), teamId: (teamId || '').trim() };
    }).filter((r) => r.email);
    onSubmit(rows);
  };

  return (
    <div className="panel p-4 space-y-2">
      <h3 className="font-semibold">CSV Upload</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="w-full min-h-28 bg-black/30 border border-border rounded p-2 text-sm font-mono" />
      <button onClick={parse} className="px-3 py-1 rounded border border-cyan text-cyan">Replace Allowlist</button>
    </div>
  );
}
