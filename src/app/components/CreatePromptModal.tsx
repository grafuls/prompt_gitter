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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-black">Create New Prompt</h2>
          <button
            onClick={onClose}
            className="text-black hover:text-black/70"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md h-32 text-black font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-1">
                Provider
              </label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as Provider)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
              >
                {Object.entries(PROVIDERS).map(([key, { name }]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-black mb-1">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
              >
                {PROVIDERS[provider].models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-black bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-black/80 disabled:bg-black/50"
            >
              {isSaving ? 'Creating...' : 'Create Prompt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 