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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 rounded-t-lg">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-black">
              {isEditing ? 'Edit Prompt' : 'View Prompt'}
            </h2>
            <button
              onClick={onClose}
              className="text-black hover:text-black/70"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-black mb-1">
                Title
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
                  required
                />
              ) : (
                <p className="text-black">{title}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-black mb-1">
                Description
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
                  required
                />
              ) : (
                <p className="text-black">{description}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-black mb-1">
                Prompt
              </label>
              {isEditing ? (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md h-32 text-black font-mono"
                  required
                />
              ) : (
                <pre className="whitespace-pre-wrap text-black font-mono bg-gray-50 p-3 rounded-md">
                  {content}
                </pre>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-black mb-1">
                Tags
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
                  required
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {prompt.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="bg-gray-100 text-black px-2 py-1 rounded-md text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  Provider
                </label>
                {isEditing ? (
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
                ) : (
                  <p className="text-black">{PROVIDERS[provider]?.name || provider}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  Model
                </label>
                {isEditing ? (
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
                ) : (
                  <p className="text-black">{model}</p>
                )}
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}
          </form>
        </div>

        <div className="sticky bottom-0 bg-white p-6 border-t border-gray-200 rounded-b-lg">
          <div className="flex justify-between">
            <div>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100"
                  disabled={isSaving}
                >
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Are you sure?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    disabled={isSaving}
                  >
                    Yes, Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-black bg-gray-100 rounded-md hover:bg-gray-200"
                disabled={isSaving}
              >
                Close
              </button>
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-black/80"
                  disabled={isSaving}
                >
                  Edit
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setTitle(prompt.title);
                      setDescription(prompt.description);
                      setContent(prompt.content || '');
                      setTags(prompt.tags.join(', '));
                      setProvider(prompt.provider || 'openai');
                      setModel(prompt.model);
                    }}
                    className="px-4 py-2 text-sm font-medium text-black bg-gray-100 rounded-md hover:bg-gray-200"
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-black/80"
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 