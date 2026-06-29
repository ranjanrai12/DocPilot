import { useAuth } from '../context/AuthContext';
import DocumentsPanel from '../components/DocumentsPanel';
import ChatPanel from '../components/ChatPanel';

// Single workspace view: documents (upload + list) and chat side by side.
export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-600/30">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">DocPilot</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{user?.email}</span>
          <button
            onClick={logout}
            className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <DocumentsPanel />
        <ChatPanel />
      </div>
    </div>
  );
}
