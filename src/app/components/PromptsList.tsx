'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useSession } from 'next-auth/react';
import ViewEditPromptModal from './ViewEditPromptModal';

type Provider = 'openai' | 'anthropic' | 'google' | 'xai' | 'meta' | 'mistral';

interface Prompt {
  id: string;
  title: string;
  description: string;
  tags: string[];
  provider: Provider;
  model: string;
  filename: string;
  content?: string;
  createdAt: string;
  updatedAt: string;
}

type SortField = 'title' | 'updatedAt';
type SortOrder = 'asc' | 'desc';

export interface PromptsListRef {
  refreshPrompts: () => Promise<void>;
}

interface PromptsListProps {
  onCreatePrompt: () => void;
  isCreateDisabled: boolean;
}

const PROVIDERS: Record<Provider, { name: string }> = {
  openai: { name: 'OpenAI' },
  anthropic: { name: 'Anthropic' },
  google: { name: 'Google' },
  xai: { name: 'xAI' },
  meta: { name: 'Meta' },
  mistral: { name: 'Mistral' }
};

const PromptsList = forwardRef<PromptsListRef, PromptsListProps>(({ onCreatePrompt, isCreateDisabled }, ref) => {
  const { data: session } = useSession();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTagsDropdownOpen, setIsTagsDropdownOpen] = useState(false);
  const [isProvidersDropdownOpen, setIsProvidersDropdownOpen] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<Provider[]>([]);
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchPrompts = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      // Fetch metadata.json
      const metadataResponse = await fetch(
        `https://api.github.com/repos/${session?.username}/ai_prompts/contents/metadata.json`,
        {
          headers: {
            'Authorization': `Bearer ${session?.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!metadataResponse.ok) {
        throw new Error('Failed to fetch prompts metadata');
      }

      const metadataData = await metadataResponse.json();
      const metadata = JSON.parse(atob(metadataData.content));
      const promptsMetadata = metadata.prompts || [];

      // Fetch content for each prompt
      const promptsWithContent = await Promise.all(
        promptsMetadata.map(async (prompt: Prompt) => {
          try {
            const contentResponse = await fetch(
              `https://api.github.com/repos/${session?.username}/ai_prompts/contents/prompts/${prompt.filename}`,
              {
                headers: {
                  'Authorization': `Bearer ${session?.accessToken}`,
                  'Accept': 'application/vnd.github.v3+json',
                },
              }
            );

            if (!contentResponse.ok) {
              throw new Error(`Failed to fetch content for prompt: ${prompt.title}`);
            }

            const contentData = await contentResponse.json();
            return {
              ...prompt,
              content: atob(contentData.content),
            };
          } catch (err) {
            console.error(`Error fetching content for prompt ${prompt.title}:`, err);
            return prompt;
          }
        })
      );

      setPrompts(promptsWithContent);
    } catch (err) {
      console.error('Error fetching prompts:', err);
      setError('Failed to fetch prompts. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    refreshPrompts: fetchPrompts
  }));

  useEffect(() => {
    if (session?.username && session?.accessToken) {
      fetchPrompts();
    }
  }, [session?.username, session?.accessToken]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleProvider = (provider: Provider) => {
    setSelectedProviders(prev =>
      prev.includes(provider)
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const filteredPrompts = prompts
    .filter(prompt =>
      (searchQuery === '' ||
        prompt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prompt.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prompt.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())))
    )
    .filter(prompt =>
      selectedTags.length === 0 ||
      selectedTags.some(tag => prompt.tags.includes(tag))
    )
    .filter(prompt =>
      selectedProviders.length === 0 ||
      selectedProviders.includes(prompt.provider)
    )
    .sort((a, b) => {
      let comparison = 0;
      if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'updatedAt') {
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-center py-4">
        {error}
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-black mb-4">No prompts found. Create your first prompt!</p>
        <button
          onClick={onCreatePrompt}
          disabled={isCreateDisabled}
          className="px-4 py-2 bg-[#238636] text-white rounded-md hover:bg-[#2ea043] transition-colors disabled:opacity-50"
        >
          Create New Prompt
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-md bg-[#2a2a2a] border border-[#3a3a3a] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#238636] focus:border-[#238636]"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => {
                setIsTagsDropdownOpen(!isTagsDropdownOpen);
                setIsProvidersDropdownOpen(false);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-black bg-white hover:bg-gray-50"
            >
              Tags ({selectedTags.length})
            </button>
            {isTagsDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="p-2">
                  {Array.from(new Set(prompts.flatMap(prompt => prompt.tags))).sort().map(tag => (
                    <label key={tag} className="flex items-center p-2 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag)}
                        onChange={() => toggleTag(tag)}
                        className="mr-2"
                      />
                      {tag}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => {
                setIsProvidersDropdownOpen(!isProvidersDropdownOpen);
                setIsTagsDropdownOpen(false);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-black bg-white hover:bg-gray-50"
            >
              Providers ({selectedProviders.length})
            </button>
            {isProvidersDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                <div className="p-2">
                  {Object.entries(PROVIDERS).map(([provider, { name }]) => (
                    <label key={provider} className="flex items-center p-2 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedProviders.includes(provider as Provider)}
                        onChange={() => toggleProvider(provider as Provider)}
                        className="mr-2"
                      />
                      {name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => toggleSort('title')}
              className={`px-4 py-2 border rounded-md ${
                sortField === 'title'
                  ? 'bg-black text-white'
                  : 'bg-white text-black border-gray-300'
              }`}
            >
              Title {sortField === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => toggleSort('updatedAt')}
              className={`px-4 py-2 border rounded-md ${
                sortField === 'updatedAt'
                  ? 'bg-black text-white'
                  : 'bg-white text-black border-gray-300'
              }`}
            >
              Date {sortField === 'updatedAt' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
          </div>
          <button
            onClick={onCreatePrompt}
            disabled={isCreateDisabled}
            className="px-4 py-2 bg-[#238636] text-white rounded-md hover:bg-[#2ea043] transition-colors disabled:opacity-50"
          >
            Create New Prompt
          </button>
        </div>
      </div>

      {(isTagsDropdownOpen || isProvidersDropdownOpen) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setIsTagsDropdownOpen(false);
            setIsProvidersDropdownOpen(false);
          }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPrompts.map((prompt) => (
          <div
            key={prompt.id}
            className="bg-white p-4 rounded-lg shadow border border-gray-200 flex flex-col h-full"
          >
            <div className="flex flex-col flex-grow">
              <button
                onClick={() => setSelectedPrompt(prompt)}
                className="text-lg font-semibold text-black hover:underline text-left mb-2"
              >
                {prompt.title}
              </button>
              <p className="text-black/70 mb-4 line-clamp-2">{prompt.description}</p>
              <div className="mt-auto space-y-2">
                <div className="flex flex-wrap gap-2">
                  {prompt.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-sm text-black bg-gray-100 px-2 py-1 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex flex-col gap-1 text-sm text-black/60">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Provider:</span>
                    {PROVIDERS[prompt.provider]?.name || prompt.provider}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Model:</span>
                    {prompt.model}
                  </div>
                  <div>
                    Last updated: {new Date(prompt.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedPrompt && (
        <ViewEditPromptModal
          isOpen={true}
          onClose={() => {
            setSelectedPrompt(null);
            fetchPrompts();
          }}
          prompt={selectedPrompt}
          onPromptUpdated={fetchPrompts}
        />
      )}
    </div>
  );
});

PromptsList.displayName = 'PromptsList';

export default PromptsList; 