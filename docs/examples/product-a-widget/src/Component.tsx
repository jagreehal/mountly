interface ProductASettingsData {
  tenantId: string;
  plan: string;
  seats: number;
  apiBase: string;
}

interface ProductASettingsProps {
  data?: ProductASettingsData | null;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
}

export function ProductASettings({ data, loading, error, onClose }: ProductASettingsProps) {
  if (loading) {
    return (
      <div className="product-a-panel" data-state="loading">
        <p>Loading Product A settings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="product-a-panel" data-state="error">
        <p>{error}</p>
        {onClose && (
          <button type="button" onClick={onClose}>
            Dismiss
          </button>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="product-a-panel" data-state="empty">
        <p>No settings loaded.</p>
      </div>
    );
  }

  return (
    <div className="product-a-panel" data-state="ready">
      <header>
        <span className="badge">Product A</span>
        <h2>Tenant settings</h2>
        <p className="muted">Exclusive to Product A API — not part of the platform shell.</p>
      </header>
      <dl>
        <div>
          <dt>Tenant</dt>
          <dd>{data.tenantId}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{data.plan}</dd>
        </div>
        <div>
          <dt>Seats</dt>
          <dd>{data.seats}</dd>
        </div>
        <div>
          <dt>API</dt>
          <dd>
            <code>{data.apiBase}</code>
          </dd>
        </div>
      </dl>
      {onClose && (
        <button type="button" className="close" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
}
