import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">DocPilot</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.email}</span>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Welcome to DocPilot</h2>
        <p className="text-gray-500">
          Phase 1 complete — you're authenticated. Document upload and chat come in Phase 2 & 3.
        </p>
        <div className="mt-6 rounded-xl bg-white border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-700 mb-1">Signed in as</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <p className="text-sm text-gray-400 mt-1">Role: {user?.role} · Workspace: {user?.workspaceId}</p>
        </div>
      </main>
    </div>
  );
}
