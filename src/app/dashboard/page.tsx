'use client';

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import CreatePromptModal from "../components/CreatePromptModal";
import PromptsList, { PromptsListRef } from "../components/PromptsList";

type RepoStatus = {
  state: 'not_exists' | 'exists' | 'checking' | 'creating' | 'error';
  isCreating: boolean;
};

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [repoStatus, setRepoStatus] = useState<RepoStatus>({ state: 'checking', isCreating: false });
  const [errorMessage, setErrorMessage] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const promptsListRef = useRef<PromptsListRef>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    async function checkRepository() {
      // Reset status when session changes
      setRepoStatus({ state: 'checking', isCreating: false });
      
      // Only proceed if we have the necessary session data
      if (!session || !session.username || !session.accessToken || status !== 'authenticated') {
        return;
      }

      try {
        const response = await fetch(`https://api.github.com/repos/${session.username}/ai_prompts`, {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          }
        });
        
        if (response.status === 404) {
          setRepoStatus({ state: 'not_exists', isCreating: false });
        } else if (response.ok) {
          setRepoStatus({ state: 'exists', isCreating: false });
        } else {
          setRepoStatus({ state: 'error', isCreating: false });
          const data = await response.json();
          setErrorMessage(data.message || 'Failed to check repository status');
        }
      } catch (error) {
        setRepoStatus({ state: 'error', isCreating: false });
        setErrorMessage('Failed to check repository status');
      }
    }

    checkRepository();
  }, [session, status]);

  const createRepository = async () => {
    if (!session?.username) return;

    setRepoStatus({ state: 'creating', isCreating: true });
    try {
      const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'ai_prompts',
          description: 'Repository for storing and managing AI prompts',
          private: false,
          auto_init: true,
        }),
      });

      if (response.ok) {
        setRepoStatus({ state: 'exists', isCreating: false });
      } else {
        setRepoStatus({ state: 'error', isCreating: false });
        const data = await response.json();
        setErrorMessage(data.message || 'Failed to create repository');
      }
    } catch (error) {
      setRepoStatus({ state: 'error', isCreating: false });
      setErrorMessage('Failed to create repository');
    }
  };

  // Show loading state only when session is loading
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // If not authenticated, don't render anything (useEffect will redirect)
  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-black">Prompt Gitter Dashboard</h1>
            </div>
            <div className="flex items-center">
              {session?.user?.image && (
                <Image
                  src={session.user.image}
                  alt="Profile"
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="ml-3 text-black">{session?.user?.name}</span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="ml-4 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-black hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-black">Welcome, {session?.user?.name}!</h2>
            
            {/* Repository Status Section */}
            <div className="mb-8 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-black mb-4">AI Prompts Repository Status</h3>
              {repoStatus.state === 'error' && (
                <div className="mb-4 p-4 bg-red-50 text-black rounded-md">
                  Error: {errorMessage}
                </div>
              )}
              {repoStatus.state === 'checking' && (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-black"></div>
                </div>
              )}
              {repoStatus.state === 'exists' && (
                <div className="flex items-center justify-between">
                  <span className="text-black">✓ Repository exists</span>
                  <a
                    href={`https://github.com/${session?.username}/ai_prompts`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-black text-white rounded-md hover:bg-black/80 transition-colors"
                  >
                    View Repository
                  </a>
                </div>
              )}
              {repoStatus.state === 'not_exists' && (
                <div className="flex items-center justify-between">
                  <span className="text-black">Repository does not exist</span>
                  <button
                    onClick={createRepository}
                    className="px-4 py-2 bg-black text-white rounded-md hover:bg-black/80 transition-colors"
                    disabled={repoStatus.isCreating}
                  >
                    {repoStatus.isCreating ? 'Creating...' : 'Create Repository'}
                  </button>
                </div>
              )}
            </div>

            {/* Prompts List Section */}
            {repoStatus.state === 'exists' && (
              <div>
                <h3 className="text-lg font-semibold text-black mb-4">Your Prompts</h3>
                <PromptsList 
                  ref={promptsListRef}
                  onCreatePrompt={() => setIsCreateModalOpen(true)}
                  isCreateDisabled={repoStatus.state !== 'exists'}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <CreatePromptModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onPromptCreated={() => {
          setIsCreateModalOpen(false);
          promptsListRef.current?.refreshPrompts();
        }}
      />
    </div>
  );
} 