'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Trash2 } from 'lucide-react';

type HistoryEntry = {
  id: string;
  url: string;
  domain: string;
  title: string;
  content_hash: string;
  previous_hash?: string;
  has_changes: boolean;
  change_summary?: string;
  summary?: string;
  scraped_at: string;
  last_checked_at: string;
  status_code: number;
};

type DiffResult = {
  url: string;
  from_id: string;
  to_id: string;
  from_timestamp: string;
  to_timestamp: string;
  from_hash: string;
  to_hash: string;
  diff: string;
  lines_added: number;
  lines_removed: number;
};

type VersionDetail = {
  id: string;
  url: string;
  domain: string;
  title: string;
  content_hash: string;
  previous_hash?: string;
  has_changes: boolean;
  summary?: string;
  change_summary?: string;
  clean_text?: string;
  raw_content?: string;
  scraped_at: string;
  last_checked_at: string;
  status_code: number;
};

const apiBase = process.env.NEXT_PUBLIC_ARACHNE_API_URL || 'http://localhost:8080';

const renderDiffLines = (diff: string) => {
  const lines = diff.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line || ' ';
    let color = 'text-gray-800';
    if (trimmed.startsWith('+')) {
      color = 'text-green-700';
    } else if (trimmed.startsWith('-')) {
      color = 'text-red-700';
    } else if (trimmed.startsWith('@@')) {
      color = 'text-indigo-700';
    }

    return (
      <div key={`${idx}-${trimmed.slice(0, 8)}`} className={`whitespace-pre-wrap font-mono text-[13px] ${color}`}>
        {trimmed}
      </div>
    );
  });
};

export default function HistoryDetailPage() {
  const { encodedUrl } = useParams<{ encodedUrl: string }>();
  const router = useRouter();
  const decodedUrl = useMemo(() => decodeURIComponent(encodedUrl || ''), [encodedUrl]);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, { loading: boolean; data?: DiffResult; error?: string }>>({});
  const [analyses, setAnalyses] = useState<Record<string, { loading: boolean; text?: string; error?: string }>>({});
  const [selectedVersion, setSelectedVersion] = useState<VersionDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/api/scrapes/history?url=${encodeURIComponent(decodedUrl)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`Failed to load history (${res.status})`);
        }
        const data: HistoryEntry[] = await res.json();
        setHistory(data || []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setIsLoading(false);
      }
    };

    if (decodedUrl) {
      fetchHistory();
    }
  }, [decodedUrl]);

  const fetchDiff = async (entryId: string) => {
    const currentIdx = history.findIndex((h) => h.id === entryId);
    if (currentIdx === -1 || currentIdx === history.length - 1) {
      setDiffs((prev) => ({
        ...prev,
        [entryId]: { loading: false, error: 'No previous version to diff' },
      }));
      return;
    }

    const from = history[currentIdx];
    const to = history[currentIdx + 1]; // previous version in time

    setDiffs((prev) => ({ ...prev, [entryId]: { loading: true } }));
    try {
      const res = await fetch(
        `${apiBase}/api/scrapes/diff?url=${encodeURIComponent(decodedUrl)}&from=${encodeURIComponent(
          from.scraped_at,
        )}&to=${encodeURIComponent(to.scraped_at)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch diff (${res.status})`);
      }
      const data: DiffResult = await res.json();
      setDiffs((prev) => ({ ...prev, [entryId]: { loading: false, data: data } }));
    } catch (err) {
      setDiffs((prev) => ({
        ...prev,
        [entryId]: { loading: false, error: err instanceof Error ? err.message : 'Failed to load diff' },
      }));
    }
  };

  const fetchVersion = async (id: string) => {
    setIsDetailLoading(true);
    setSelectedVersion(null);
    try {
      const res = await fetch(`${apiBase}/api/scrapes/version/${id}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load version (${res.status})`);
      }
      const data: VersionDetail = await res.json();
      setSelectedVersion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const analyzeChanges = async (entryId: string) => {
    const currentIdx = history.findIndex((h) => h.id === entryId);
    const previous = history[currentIdx + 1];
    if (!previous) {
      setAnalyses((prev) => ({ ...prev, [entryId]: { loading: false, error: 'No previous version to analyze' } }));
      return;
    }

    setAnalyses((prev) => ({ ...prev, [entryId]: { loading: true, text: '' } }));
    // Clear any existing error before retry
    setHistory((prev) =>
      prev.map((h, idx) =>
        idx === currentIdx
          ? {
              ...h,
              change_summary: h.change_summary?.startsWith('Error:') ? '' : h.change_summary,
            }
          : h,
      ),
    );
    try {
      const res = await fetch(`${apiBase}/api/scrapes/analyze-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: decodedUrl,
          from_timestamp: previous.scraped_at,
          to_timestamp: history[currentIdx].scraped_at,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value || new Uint8Array(), { stream: true });
        fullText += chunk;
        setAnalyses((prev) => ({ ...prev, [entryId]: { loading: true, text: fullText } }));
      }

      setAnalyses((prev) => ({ ...prev, [entryId]: { loading: false, text: fullText } }));
      setHistory((prev) =>
        prev.map((h, idx) =>
          idx === currentIdx
            ? {
                ...h,
                change_summary: fullText,
              }
            : h,
        ),
      );
    } catch (err) {
      setAnalyses((prev) => ({
        ...prev,
        [entryId]: { loading: false, error: err instanceof Error ? err.message : 'Failed to analyze changes' },
      }));
    }
  };

  const deleteVersion = async (entryId: string) => {
    if (!window.confirm('Are you sure you want to delete this version?')) return;
    setDeletingId(entryId);
    try {
      const res = await fetch(`${apiBase}/api/scrapes/version/${entryId}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`Failed to delete (status ${res.status})`);
      }
      setHistory((prev) => {
        const updated = prev.filter((h) => h.id !== entryId);
        if (updated.length <= 1) {
          router.push('/history');
        }
        if (selectedVersion?.id === entryId) {
          setSelectedVersion(null);
        }
        return updated;
      });
    } catch (err) {
      console.error('Delete failed', err);
      alert(err instanceof Error ? err.message : 'Failed to delete version');
    } finally {
      setDeletingId(null);
    }
  };

  const copyURL = async () => {
    try {
      await navigator.clipboard.writeText(decodedUrl);
    } catch (err) {
      console.error('Failed to copy URL', err);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.back()}
              className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-2 text-sm font-medium"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold mt-2">Version History</h1>
            <p className="text-gray-600 break-all text-sm mt-2">{decodedUrl}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-gray-500">{history.length} versions</span>
              <button
                onClick={copyURL}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Copy URL
              </button>
            </div>
          </div>
          <Link
            href="/history"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Browse all
          </Link>
        </div>

        {isLoading && (
          <div className="bg-white border rounded-lg p-6 flex items-center gap-3 text-gray-600">
            <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading history...
          </div>
        )}

        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Failed to load history</h2>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {!isLoading && !error && history.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-800">No versions yet</h2>
            <p className="text-gray-600 mt-2">Scrape this URL to start building history.</p>
          </div>
        )}

        {!isLoading && !error && history.length > 0 && (
          <div className="space-y-3">
            {history.map((entry, idx) => {
              const previous = history[idx + 1];
              const diffState = diffs[entry.id];
              const hasPrevious = Boolean(previous);
              const analysisState = analyses[entry.id];
              return (
                <div key={entry.id} className="bg-white border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">v{history.length - idx}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            entry.has_changes ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {entry.has_changes ? 'Changed' : 'No change'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            entry.status_code >= 200 && entry.status_code < 300
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {entry.status_code}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mt-1">
                        {entry.title || 'No title'}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(entry.scraped_at).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 font-mono break-all">
                        hash {entry.content_hash.slice(0, 12)}...
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <button
                        onClick={() => fetchVersion(entry.id)}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View version
                      </button>
                      <button
                        onClick={() => fetchDiff(entry.id)}
                        disabled={!hasPrevious}
                        className={`text-sm font-medium inline-flex items-center gap-1 ${
                          hasPrevious
                            ? 'text-purple-600 hover:text-purple-700'
                            : 'text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {hasPrevious ? 'Diff vs previous' : 'No previous version'}
                      </button>
                      {hasPrevious &&
                        entry.has_changes &&
                        (!entry.change_summary || entry.change_summary.startsWith('Error:')) && (
                        <button
                          onClick={() => analyzeChanges(entry.id)}
                          disabled={analysisState?.loading}
                          className={`text-sm font-medium inline-flex items-center gap-1 ${
                            analysisState?.loading
                              ? 'text-gray-400 cursor-not-allowed'
                              : 'text-purple-700 hover:text-purple-800'
                          }`}
                        >
                          {analysisState?.loading
                            ? 'Analyzing…'
                            : entry.change_summary?.startsWith('Error:')
                              ? 'Retry analysis'
                              : 'Analyze changes'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteVersion(entry.id)}
                        disabled={deletingId === entry.id}
                        className={`text-sm font-medium inline-flex items-center gap-1 ${
                          deletingId === entry.id
                            ? 'text-red-300 cursor-not-allowed'
                            : 'text-red-700 hover:text-red-800'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        {deletingId === entry.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {(entry.change_summary || analysisState?.text || analysisState?.error) && (
                    <div className="mt-3 bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm text-gray-800">
                      <div className="font-medium text-purple-700 mb-1">Change summary:</div>
                      {entry.change_summary && (
                        <div className="prose prose-sm text-gray-900">
                          <ReactMarkdown>{entry.change_summary}</ReactMarkdown>
                        </div>
                      )}
                      {!entry.change_summary && analysisState?.text && (
                        <div className="prose prose-sm text-gray-900 whitespace-pre-wrap">
                          {analysisState.text}
                        </div>
                      )}
                      {analysisState?.error && (
                        <div className="text-sm text-red-600">{analysisState.error}</div>
                      )}
                    </div>
                  )}

                  {entry.summary && (
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-gray-800">
                  <div className="font-medium text-blue-700 mb-1">Summary:</div>
                  <div className="prose prose-sm text-gray-900">
                    <ReactMarkdown>{entry.summary}</ReactMarkdown>
                  </div>
                    </div>
                  )}

                  {diffState && (
                    <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                      {diffState.loading && (
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Loading diff...
                        </div>
                      )}
                      {diffState.error && (
                        <p className="text-sm text-red-600">{diffState.error}</p>
                      )}
                      {diffState.data && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 text-xs text-gray-600">
                            <span className="font-mono bg-white border rounded px-2 py-1">
                              +{diffState.data.lines_added} / -{diffState.data.lines_removed}
                            </span>
                            <span className="text-gray-500">
                              {new Date(diffState.data.from_timestamp).toLocaleString()} →{' '}
                              {new Date(diffState.data.to_timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded p-3 overflow-x-auto">
                            <div className="space-y-0.5">{renderDiffLines(diffState.data.diff)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Version detail modal */}
      {selectedVersion && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedVersion(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b p-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Version {selectedVersion.id}</h2>
                <p className="text-sm text-gray-600 break-all">{selectedVersion.url}</p>
              </div>
              <button
                onClick={() => setSelectedVersion(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Title:</span> <span className="text-gray-900">{selectedVersion.title || 'No title'}</span></div>
                <div><span className="text-gray-500">Domain:</span> <span className="text-gray-900">{selectedVersion.domain}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className="text-gray-900">{selectedVersion.status_code}</span></div>
                <div><span className="text-gray-500">Scraped:</span> <span className="text-gray-900">{new Date(selectedVersion.scraped_at).toLocaleString()}</span></div>
                <div className="md:col-span-2">
                  <span className="text-gray-500">Hash:</span>{' '}
                  <span className="text-gray-900 font-mono break-all">{selectedVersion.content_hash}</span>
                </div>
              </div>

              {selectedVersion.summary && (
                <div className="bg-blue-50 border border-blue-100 rounded p-3 text-sm text-gray-800">
                  <div className="font-semibold text-blue-700 mb-1">Summary:</div>
                  <div className="prose prose-sm text-gray-900">
                    <ReactMarkdown>{selectedVersion.summary}</ReactMarkdown>
                  </div>
                </div>
              )}

              {selectedVersion.change_summary && (
                <div className="bg-purple-50 border border-purple-100 rounded p-3 text-sm text-gray-800">
                  <span className="font-semibold text-purple-700">Change summary: </span>
                  {selectedVersion.change_summary}
                </div>
              )}

              {selectedVersion.clean_text && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">Content (first 800 chars)</h3>
                  <div className="bg-gray-50 border rounded p-3 text-sm text-gray-800 whitespace-pre-wrap">
                    {selectedVersion.clean_text.slice(0, 800)}
                    {selectedVersion.clean_text.length > 800 ? '…' : ''}
                  </div>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 bg-gray-50 border-t p-4 flex justify-end">
              <button
                onClick={() => setSelectedVersion(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading modal for version */}
      {isDetailLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3 text-gray-700">
            <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading version…
          </div>
        </div>
      )}
    </main>
  );
}

