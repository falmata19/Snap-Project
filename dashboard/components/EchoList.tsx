"use client";

import type { Echo } from "@/lib/api";

function remaining(expiresAt: number): string {
  const seconds = Math.max(0, expiresAt - Date.now() / 1000);
  const days = Math.floor(seconds / 86400);
  if (days > 0) {
    return `${days}d left`;
  }
  return `${Math.floor(seconds / 3600)}h left`;
}

export default function EchoList({
  echoes,
  onDelete,
}: {
  echoes: Echo[];
  onDelete: (id: string) => void;
}) {
  if (echoes.length === 0) {
    return <p className="muted">No echoes for this creator id.</p>;
  }
  return (
    <ul className="list">
      {echoes.map((e) => (
        <li key={e.id} className="row">
          <div className="grow">
            <strong>
              {e.kind}
              {e.creature ? ` · ${e.creature}` : ""}
            </strong>
            <div className="muted">
              {e.interactions} visits · {remaining(e.expires_at)}
            </div>
            <div className="bar">
              <div className="fill" style={{ width: `${Math.round(e.strength * 100)}%` }} />
            </div>
          </div>
          <button onClick={() => onDelete(e.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
