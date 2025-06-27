'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

interface ViewEditPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    provider: Provider;
    model: string;
    filename: string;
    content?: string;
  };
  onPromptUpdated: () => void;
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

export default function ViewEditPromptModal({ isOpen, onClose, prompt, onPromptUpdated }: ViewEditPromptModalProps) {
  const { data: session } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(prompt.title);
  const [description, setDescription] = useState(prompt.description);
  const [content, setContent] = useState(prompt.content || '');
  const [tags, setTags] = useState(prompt.tags.join(', '));
  const [provider, setProvider] = useState<Provider>(prompt.provider || 'openai');
  const [model, setModel] = useState(prompt.model);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    // Only auto-select the first model if the current model isn't in the new provider's list
    if (!PROVIDERS[newProvider].models.includes(model)) {
      setModel(PROVIDERS[newProvider].models[0]);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      // Get current metadata.json
      const metadataResponse = await fetch(
        `https://api.github.com/repos/${session?.username}/ai_prompts/contents/metadata.json`,
        {
          headers: {
            'Authorization': `Bearer ${session?.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      const metadataData = await metadataResponse.json();
      const metadata = JSON.parse(atob(metadataData.content));

      // Update the prompt in metadata
      const promptIndex = metadata.prompts.findIndex((p: any) => p.id === prompt.id);
      if (promptIndex !== -1) {
        // If title has changed, generate new filename
        let filename = prompt.filename;
        if (title !== prompt.title) {
          // Convert title to kebab case for filename
          const baseFilename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          
          // Check for existing prompts with similar filenames to handle duplicates
          const existingPrompts = metadata.prompts.filter((p: PromptMetadata) => 
            p.id !== prompt.id && p.filename.startsWith(`${baseFilename}-`)
          );
          const suffix = existingPrompts.length > 0 ? existingPrompts.length : '';
          filename = `${baseFilename}-${Date.now()}${suffix}.md`;

          // Delete old prompt file
          const oldPromptResponse = await fetch(
            `https://api.github.com/repos/${session?.username}/ai_prompts/contents/prompts/${prompt.filename}`,
            {
              headers: {
                'Authorization': `Bearer ${session?.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
              },
            }
          );

          const oldPromptData = await oldPromptResponse.json();

          await fetch(
            `https://api.github.com/repos/${session?.username}/ai_prompts/contents/prompts/${prompt.filename}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${session?.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: `Delete old prompt file: ${prompt.title}`,
                sha: oldPromptData.sha,
              }),
            }
          );
        }

        metadata.prompts[promptIndex] = {
          ...metadata.prompts[promptIndex],
          title,
          description,
          tags: tags.split(',').map((tag: string) => tag.trim()),
          provider,
          model,
          filename,
          updatedAt: new Date().toISOString(),
        };

        // Update metadata.json
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
              message: `Update prompt: ${title}`,
              content: btoa(JSON.stringify(metadata, null, 2)),
              sha: metadataData.sha,
            }),
          }
        );

        // Create new prompt file with new filename if title changed, otherwise update existing
        await fetch(
          `https://api.github.com/repos/${session?.username}/ai_prompts/contents/prompts/${filename}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${session?.accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `Update prompt: ${title}`,
              content: btoa(unescape(encodeURIComponent(content))),
              ...(filename === prompt.filename && {
                sha: (await (await fetch(
                  `https://api.github.com/repos/${session?.username}/ai_prompts/contents/prompts/${filename}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${session?.accessToken}`,
                      'Accept': 'application/vnd.github.v3+json',
                    },
                  }
                )).json()).sha,
              }),
            }),
          }
        );
      }

      setIsEditing(false);
      onPromptUpdated();
    } catch (err) {
      console.error('Error updating prompt:', err);
      setError('Failed to update prompt. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    setError('');

    try {
      // Get current metadata.json
      const metadataResponse = await fetch(
        `https://api.github.com/repos/${session?.username}/ai_prompts/contents/metadata.json`,
        {
          headers: {
            'Authorization': `Bearer ${session?.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      const metadataData = await metadataResponse.json();
      const metadata = JSON.parse(atob(metadataData.content));

      // Remove the prompt from metadata
      metadata.prompts = metadata.prompts.filter((p: any) => p.id !== prompt.id);

      // Update metadata.json
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
            message: `Delete prompt: ${prompt.title}`,
            content: btoa(JSON.stringify(metadata, null, 2)),
            sha: metadataData.sha,
          }),
        }
      );

      // Get prompt file info
      const promptResponse = await fetch(
        `https://api.github.com/repos/${session?.username}/ai_prompts/contents/prompts/${prompt.filename}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      const promptData = await promptResponse.json();

      // Delete prompt file
      await fetch(
        `https://api.github.com/repos/${session?.username}/ai_prompts/contents/prompts/${prompt.filename}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session?.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Delete prompt: ${prompt.title}`,
            sha: promptData.sha,
          }),
        }
      );

      onClose();
      onPromptUpdated();
    } catch (err) {
      console.error('Error deleting prompt:', err);
      setError('Failed to delete prompt. Please try again.');
    } finally {
      setIsSaving(false);
      setShowDeleteConfirm(false);
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
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium leading-6 text-default">
              {isEditing ? 'Edit Prompt' : prompt.title}
            </h3>
            <div className="flex space-x-2">
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1 text-sm font-medium text-white bg-[#2a2a2a] border border-[#3a3a3a] rounded-md hover:bg-[#3a3a3a]"
                >
                  Edit
                </button>
              )}
              <button
                onClick={onClose}
                className="px-3 py-1 text-sm font-medium text-white bg-[#2a2a2a] border border-[#3a3a3a] rounded-md hover:bg-[#3a3a3a]"
              >
                Close
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-error/10 text-error rounded-md">
              {error}
            </div>
          )}

          {isEditing ? (
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
                <label htmlFor="content" className="block text-sm font-medium text-default">
                  Prompt
                </label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  className="mt-1 block w-full rounded-md bg-[#2a2a2a] border-[#3a3a3a] text-white shadow-sm focus:border-accent focus:ring focus:ring-accent focus:ring-opacity-50 placeholder-gray-400 font-mono"
                  required
                  placeholder="Enter your prompt text"
                />
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-error rounded-md hover:opacity-90"
                >
                  Delete Prompt
                </button>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#2a2a2a] border border-[#3a3a3a] rounded-md hover:bg-[#3a3a3a]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-button rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-default">Description</h4>
                <p className="mt-1 text-secondary">{prompt.description || 'No description provided'}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-default">Provider</h4>
                <p className="mt-1 text-secondary">{PROVIDERS[prompt.provider].name}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-default">Model</h4>
                <p className="mt-1 text-secondary">{prompt.model}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-default">Tags</h4>
                <div className="mt-1 flex flex-wrap gap-2">
                  {prompt.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 text-xs rounded-full bg-[#2a2a2a] text-white border border-[#3a3a3a]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-default">Prompt</h4>
                <pre className="mt-1 p-4 rounded-md bg-[#2a2a2a] text-white border border-[#3a3a3a] font-mono whitespace-pre-wrap">
                  {prompt.content || content}
                </pre>
              </div>
            </div>
          )}

          {showDeleteConfirm && (
            <div className="fixed inset-0 overflow-y-auto z-[60]">
              <div 
                className="flex items-center justify-center min-h-screen"
                onClick={() => setShowDeleteConfirm(false)}
              >
                <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                  <div className="absolute inset-0 bg-black/75"></div>
                </div>

                <div 
                  className="relative bg-card rounded-lg p-6 max-w-sm mx-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-medium text-default mb-4">Delete Prompt</h3>
                  <p className="text-secondary mb-6">
                    Are you sure you want to delete this prompt? This action cannot be undone.
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 text-sm font-medium text-white bg-[#2a2a2a] border border-[#3a3a3a] rounded-md hover:bg-[#3a3a3a]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-medium text-white bg-error rounded-md hover:opacity-90"
                    >
                      {isSaving ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 