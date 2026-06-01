import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@docpilot/shared';

// The fetch function. Returns the typed shape shared with the backend.
async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export default function App() {
  // useQuery: runs fetchHealth, and gives us loading/error/data state for free.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 640,
        margin: '64px auto',
        padding: 16,
      }}
    >
      <h1 style={{ marginBottom: 4 }}>DocPilot</h1>
      <p style={{ color: '#666', marginTop: 0 }}>AI Knowledge Assistant — Phase 0 scaffold</p>

      <h2>API health</h2>
      {isLoading && <p>Checking the API…</p>}
      {isError && (
        <p style={{ color: 'crimson' }}>❌ API not reachable (is the api running on :3000?)</p>
      )}
      {data && (
        <pre style={{ background: '#f4f4f5', padding: 16, borderRadius: 8 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  );
}
