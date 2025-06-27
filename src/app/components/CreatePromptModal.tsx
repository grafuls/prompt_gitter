'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

interface CreatePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptCreated: () => void;
}

type Provider = 'openai' | 'anthropic' | 'google' | 'xai' | 'meta' | 'mistral';

interface ProviderConfig {
  name: string;
  models: string[];
}

interface PromptMetadata {
  id: string;
  title: string;
  description: string;
  tags: string[];
  provider: Provider;
  model: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
}

interface Metadata {
  prompts: PromptMetadata[];
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'gpt-3.5']
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-2.1', 'claude-2']
  },
  google: {
    name: 'Google',
    models: ['gemini-pro', 'gemini-ultra']
  },
  xai: {
    name: 'xAI',
    models: ['grok-1']
  },
  meta: {
    name: 'Meta',
    models: ['llama-2-70b', 'llama-2-13b', 'llama-2-7b']
  },
  mistral: {
    name: 'Mistral',
    models: ['mistral-large', 'mistral-medium', 'mistral-small']
  }
};

export default function CreatePromptModal({ isOpen, onClose, onPromptCreated }: CreatePromptModalProps) {
  const { data: session } = useSession();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tags, setTags] = useState('');
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState(PROVIDERS.openai.models[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setModel(PROVIDERS[newProvider].models[0]); // Reset to first model of new provider
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      // Get metadata.json first
      const metadataResponse = await fetch(
        `https://api.github.com/repos/${session?.username}/ai_prompts/contents/metadata.json`,
        {
          headers: {
            'Authorization': `Bearer ${session?.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      let metadata: Metadata = { prompts: [] };
      let sha = '';

      if (metadataResponse.status !== 404) {
        const metadataData = await metadataResponse.json();
        metadata = JSON.parse(atob(metadataData.content));
        sha = metadataData.sha;
      }

      // Convert title to kebab case for filename
      const baseFilename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      
      // Check for existing prompts with similar filenames to handle duplicates
      const existingPrompts = metadata.prompts.filter(p => p.filename.startsWith(`${baseFilename}-`));
      const suffix = existingPrompts.length > 0 ? existingPrompts.length : '';
      const filename = `${baseFilename}-${Date.now()}${suffix}.md`;

      // Create new prompt metadata
      const newPrompt: PromptMetadata = {
        id: Date.now().toString(),
        title,
        description,
        tags: tags.split(',').map(tag => tag.trim()),
        provider,
        model,
        filename,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add to metadata
      metadata.prompts.push(newPrompt);

      // Update or create metadata.json
      await fetch(
        `https://api.github.com/repos/${session?.username}/ai_prompts/contents/metadata.json`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session?.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Add prompt: ${title}`,
            content: btoa(JSON.stringify(metadata, null, 2)),
            ...(sha ? { sha } : {}),
          }),
        }
      );

      // Create prompt file
      await fetch(
        `https://api.github.com/repos/${session?.username}/ai_prompts/contents/prompts/${newPrompt.filename}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session?.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Add prompt: ${title}`,
            content: btoa(unescape(encodeURIComponent(prompt))),
          }),
        }
      );

      onClose();
      onPromptCreated();
      // Reset form
      setTitle('');
      setDescription('');
      setPrompt('');
      setTags('');
      setProvider('openai');
      setModel(PROVIDERS.openai.models[0]);
    } catch (err) {
      console.error('Error creating prompt:', err);
      setError('Failed to create prompt. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto z-50">
      <div 
        className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center"
        onClick={() => onClose()}
      >
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-black/75"></div>
        </div>

        <div 
          className="relative inline-block w-full max-w-2xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-card shadow-xl rounded-lg border border-default"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-medium leading-6 text-default mb-4">
            Create New Prompt
          </h3>
          
          {error && (
            <div className="mb-4 p-4 bg-error/10 text-error rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-default">
                Title
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-md bg-[#2a2a2a] border-[#3a3a3a] text-white shadow-sm focus:border-accent focus:ring focus:ring-accent focus:ring-opacity-50 placeholder-gray-400"
                required
                placeholder="Enter prompt title"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-default">
                Description
              </label>
              <input
                type="text"
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full rounded-md bg-[#2a2a2a] border-[#3a3a3a] text-white shadow-sm focus:border-accent focus:ring focus:ring-accent focus:ring-opacity-50 placeholder-gray-400"
                placeholder="Enter prompt description"
              />
            </div>

            <div>
              <label htmlFor="provider" className="block text-sm font-medium text-default">
                Provider
              </label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as Provider)}
                className="mt-1 block w-full rounded-md bg-[#2a2a2a] border-[#3a3a3a] text-white shadow-sm focus:border-accent focus:ring focus:ring-accent focus:ring-opacity-50"
              >
                {Object.entries(PROVIDERS).map(([key, value]) => (
                  <option key={key} value={key} className="bg-[#2a2a2a] text-white">
                    {value.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="model" className="block text-sm font-medium text-default">
                Model
              </label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 block w-full rounded-md bg-[#2a2a2a] border-[#3a3a3a] text-white shadow-sm focus:border-accent focus:ring focus:ring-accent focus:ring-opacity-50"
              >
                {PROVIDERS[provider].models.map((model) => (
                  <option key={model} value={model} className="bg-[#2a2a2a] text-white">
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-default">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="mt-1 block w-full rounded-md bg-[#2a2a2a] border-[#3a3a3a] text-white shadow-sm focus:border-accent focus:ring focus:ring-accent focus:ring-opacity-50 placeholder-gray-400"
                placeholder="Enter tags separated by commas"
              />
            </div>

            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-default">
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                className="mt-1 block w-full rounded-md bg-[#2a2a2a] border-[#3a3a3a] text-white shadow-sm focus:border-accent focus:ring focus:ring-accent focus:ring-opacity-50 placeholder-gray-400 font-mono"
                required
                placeholder="Enter your prompt text"
              />
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-[#2a2a2a] border border-[#3a3a3a] rounded-md hover:bg-[#3a3a3a]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-[#238636] rounded-md hover:bg-[#2ea043] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#238636] disabled:opacity-50"
              >
                {isSaving ? 'Creating...' : 'Create Prompt'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 