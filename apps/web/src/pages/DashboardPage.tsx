import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import DocumentsPanel from '../components/DocumentsPanel';
import ConversationsPanel from '../components/ConversationsPanel';
import ChatThread from '../components/ChatThread';

// Responsive workspace. Desktop (lg+): documents | conversations | chat thread,
// all visible. Mobile: a "menu" view (documents + conversations) that switches
// to the chat thread when a conversation is picked, with a back button.
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'menu' | 'chat'>('chat');

  function selectConversation(id: string | null) {
    setSelectedId(id);
    setMobileView('chat'); // on mobile, jump to the thread after picking/new
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-3 sm:px-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setMobileView('menu')}
            className={`lg:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors ${
              mobileView === 'chat' ? '' : 'hidden'
            }`}
            title="Documents & chats"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="h-7 w-7 shrink-0 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-600/30">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight truncate">DocPilot</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:block text-sm text-slate-500 truncate max-w-[180px]">{user?.email}</span>
          <button
            onClick={logout}
            className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop columns (lg+) */}
        <DocumentsPanel className="hidden lg:flex w-72 shrink-0 border-r border-slate-200" />
        <ConversationsPanel
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="hidden lg:flex w-60 shrink-0 border-r border-slate-200"
        />

        {/* Mobile menu (documents + conversations stacked) */}
        <div className={`flex-1 min-h-0 flex-col lg:hidden ${mobileView === 'menu' ? 'flex' : 'hidden'}`}>
          <DocumentsPanel className="flex flex-1 min-h-0 border-b border-slate-200" />
          <ConversationsPanel
            selectedId={selectedId}
            onSelect={selectConversation}
            className="flex flex-1 min-h-0"
          />
        </div>

        {/* Chat thread: full-width on mobile (chat view), the main column on desktop */}
        <ChatThread
          selectedId={selectedId}
          onSelect={selectConversation}
          className={`flex-1 min-h-0 lg:flex ${mobileView === 'chat' ? 'flex' : 'hidden'}`}
        />
      </div>
    </div>
  );
}
