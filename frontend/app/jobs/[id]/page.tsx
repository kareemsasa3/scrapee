'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ScrapedData {
  url: string;
  title: string;
  status: number;
  size: number;
  error?: string;
  scraped: string;
  content?: string;
}

interface ContentViewState {
  [key: number]: {
    isOpen: boolean;
    viewMode: 'raw' | 'preview';
    isExpanded: boolean;
  };
}

interface Job {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  request: {
    urls: string[];
    site_url?: string;
  };
  results?: ScrapedData[];
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress: number;
}

interface JobResponse {
  job: Job;
  metrics?: any;
}

export default function JobStatusPage() {
  const params = useParams();
  const jobId = params.id as string;
  
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [contentViewState, setContentViewState] = useState<ContentViewState>({});
  const [copySuccess, setCopySuccess] = useState<number | null>(null);
  const [previousResultCount, setPreviousResultCount] = useState(0);
  const [newResultIndices, setNewResultIndices] = useState<Set<number>>(new Set());
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);

  const fetchJob = async () => {
    try {
      console.log(`Fetching job details for ID: ${jobId}`);
      const response = await fetch(`/api/jobs/${jobId}`, {
        cache: 'no-store', // Disable caching
      });
      
      console.log(`Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error data:', errorData);
        throw new Error(errorData.error || 'Failed to fetch job');
      }

      const data: JobResponse = await response.json();
      console.log('Job data received:', data);
      
      // Track new results
      const newResultCount = data.job.results?.length || 0;
      if (newResultCount > previousResultCount) {
        console.log(`New results detected: ${newResultCount - previousResultCount} new items`);
        // Mark new results with indices
        const newIndices = new Set<number>();
        for (let i = previousResultCount; i < newResultCount; i++) {
          newIndices.add(i);
        }
        setNewResultIndices(newIndices);
        
        // Clear "new" badges after 5 seconds
        setTimeout(() => {
          setNewResultIndices(new Set());
        }, 5000);
        
        setPreviousResultCount(newResultCount);
      } else if (newResultCount === 0) {
        setPreviousResultCount(0);
      }
      
      setJob(data.job);
      setError(null);
      return data.job;
    } catch (err) {
      console.error('Error fetching job:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch job');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchJob();
  }, [jobId]);

  // Polling effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    // Only poll if job is pending or running
    if (job && (job.status === 'pending' || job.status === 'running')) {
      setIsPolling(true);
      console.log('Starting polling for job status updates...');
      
      intervalId = setInterval(async () => {
        const updatedJob = await fetchJob();
        
        // If job is now completed or failed, stop polling
        if (updatedJob && (updatedJob.status === 'completed' || updatedJob.status === 'failed')) {
          console.log('Job finished, stopping polling');
          setIsPolling(false);
          if (intervalId) {
            clearInterval(intervalId);
          }
        }
      }, 2000); // Poll every 2 seconds
    } else {
      setIsPolling(false);
    }

    // Cleanup function
    return () => {
      if (intervalId) {
        console.log('Cleaning up polling interval');
        clearInterval(intervalId);
        setIsPolling(false);
      }
    };
  }, [job?.status, jobId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const toggleContentView = (index: number) => {
    setContentViewState(prev => ({
      ...prev,
      [index]: {
        isOpen: !prev[index]?.isOpen,
        viewMode: prev[index]?.viewMode || 'raw',
        isExpanded: prev[index]?.isExpanded || false,
      }
    }));
  };

  const toggleViewMode = (index: number) => {
    setContentViewState(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        viewMode: prev[index]?.viewMode === 'raw' ? 'preview' : 'raw',
      }
    }));
  };

  const toggleExpand = (index: number) => {
    setContentViewState(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        isExpanded: !prev[index]?.isExpanded,
      }
    }));
  };

  const copyToClipboard = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(index);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const truncateContent = (content: string, maxLength: number = 5000) => {
    return content.length > maxLength ? content.slice(0, maxLength) : content;
  };

  const generateSummary = async () => {
    if (!job || !job.results || job.results.length === 0) {
      return;
    }

    // Clear existing summary and error before generating
    setSummary(null);
    setSummaryError(null);
    setIsSummarizing(true);
    setIsSummaryExpanded(true);

    try {
      console.log(`Generating streaming AI summary for job ${jobId}...`);
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: job.id,
          results: job.results,
          stream: true, // Enable streaming
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }

      // Check if we got a streaming response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        // Handle SSE streaming
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedSummary = '';

        if (!reader) {
          throw new Error('No response body');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.error) {
                  throw new Error(data.error);
                }
                
                if (data.chunk) {
                  accumulatedSummary += data.chunk;
                  setSummary(accumulatedSummary);
                }
                
                if (data.done && data.fullSummary) {
                  setSummary(data.fullSummary);
                }
              } catch (parseError) {
                // Ignore parse errors for incomplete chunks
                if (line.slice(6).trim()) {
                  console.debug('Skipping incomplete SSE chunk');
                }
              }
            }
          }
        }

        console.log('Streaming summary completed');
      } else {
        // Fallback to non-streaming response
        const data = await response.json();
        console.log('Summary generated successfully');
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Error generating summary:', err);
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setIsSummarizing(false);
    }
  };

  const sanitizeHTML = (html: string) => {
    // Basic sanitization - remove script tags and event handlers
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '');
  };

  if (isLoading) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <svg
                className="animate-spin h-12 w-12 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-gray-600">Loading job details...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-700 mb-4">{error || 'Job not found'}</p>
            
            <div className="bg-white border border-red-300 rounded p-4 mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Debug Information:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Job ID: <code className="bg-gray-100 px-1 rounded">{jobId}</code></li>
                <li>• API Endpoint: <code className="bg-gray-100 px-1 rounded">/api/jobs/{jobId}</code></li>
                <li>• Check the browser console for more details</li>
                <li>• Make sure the Arachne backend is running on port 8080</li>
              </ul>
            </div>
            
            <div className="flex gap-4">
              <Link
                href="/"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Back to Home
              </Link>
              <Link
                href="/jobs"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Create New Job
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 mb-4 inline-block"
          >
            ← Back to Home
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">Job Details</h1>
              <p className="text-gray-600">View scraping job status and details</p>
            </div>
            {isPolling && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span className="font-medium">Auto-updating...</span>
              </div>
            )}
          </div>
        </div>

        {/* Job Status Card */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Job ID</h2>
              <p className="text-lg font-mono text-gray-900">{job.id}</p>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium border ${getStatusColor(
                job.status
              )}`}
            >
              {job.status.toUpperCase()}
            </span>
          </div>

          {/* Progress Bar */}
          {job.status === 'running' && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress</span>
                <span>{job.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${job.progress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Created</h3>
              <p className="text-sm text-gray-900">{formatDate(job.created_at)}</p>
            </div>
            {job.started_at && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Started</h3>
                <p className="text-sm text-gray-900">{formatDate(job.started_at)}</p>
              </div>
            )}
            {job.completed_at && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">
                  Completed
                </h3>
                <p className="text-sm text-gray-900">{formatDate(job.completed_at)}</p>
              </div>
            )}
          </div>

          {/* URLs Being Scraped */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              {job.request.site_url ? 'Site URL' : 'URLs'}
            </h3>
            {job.request.site_url ? (
              <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded border break-all">
                {job.request.site_url}
              </p>
            ) : (
              <div className="space-y-1">
                {job.request.urls.map((url, index) => (
                  <p
                    key={index}
                    className="text-sm text-gray-900 bg-gray-50 p-2 rounded border break-all"
                  >
                    {url}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {job.error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
              <h3 className="text-sm font-medium text-red-800 mb-1">Error</h3>
              <p className="text-sm text-red-700">{job.error}</p>
            </div>
          )}
        </div>

        {/* AI Summary Section - Appears above Results */}
        {job.status === 'completed' && job.results && job.results.length > 0 && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">AI Summary</h2>
              </div>
              <div className="flex items-center gap-3">
                {summary && !isSummarizing && (
                  <button
                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    className="text-sm text-gray-600 hover:text-gray-900 font-medium"
                  >
                    {isSummaryExpanded ? 'Collapse' : 'Expand'}
                  </button>
                )}
                {!isSummarizing && (summary || summaryError) ? (
                  <button
                    onClick={generateSummary}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate Summary
                  </button>
                ) : !isSummarizing && (
                  <button
                    onClick={generateSummary}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate AI Summary
                  </button>
                )}
              </div>
            </div>

            {/* Loading State - Show streaming indicator when summarizing without content yet */}
            {isSummarizing && !summary && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <svg
                  className="animate-spin h-10 w-10 text-purple-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <p className="text-gray-600 font-medium">Generating AI summary...</p>
                <p className="text-sm text-gray-500">Content will appear in real-time</p>
              </div>
            )}

            {/* Error State */}
            {summaryError && !isSummarizing && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-800 mb-1">Failed to generate summary</h3>
                    <p className="text-sm text-red-700">{summaryError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Content - Shows during streaming and after completion */}
            {summary && isSummaryExpanded && (
              <div className="prose prose-sm max-w-none">
                <div className={`bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6 ${isSummarizing ? 'animate-pulse' : ''}`}>
                  {isSummarizing && (
                    <div className="flex items-center gap-2 mb-3 text-sm text-purple-600">
                      <svg
                        className="animate-spin h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="font-medium">Generating...</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                    {summary}
                    {isSummarizing && <span className="inline-block w-2 h-5 ml-1 bg-purple-600 animate-pulse"></span>}
                  </div>
                </div>
                {!isSummarizing && (
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => copyToClipboard(summary, -1)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {copySuccess === -1 ? (
                        <>
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-green-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy Summary
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setSummary(null);
                        setSummaryError(null);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear Summary
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* No Summary Yet - Initial State */}
            {!summary && !isSummarizing && !summaryError && (
              <div className="text-center py-6">
                <p className="text-gray-600">Click "Generate AI Summary" to create a comprehensive summary of all scraped content.</p>
              </div>
            )}
          </div>
        )}

        {/* Results Section */}
        {job.results && job.results.length > 0 && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Results ({job.results.length})
                {job.status === 'running' && (
                  <span className="ml-2 text-sm font-normal text-blue-600">
                    • Live updates
                  </span>
                )}
              </h2>
            </div>
            <div className="space-y-3">
              {job.results
                .map((result, originalIndex) => ({ result, originalIndex }))
                .sort((a, b) => {
                  // Sort by timestamp, newest first
                  const timeA = new Date(a.result.scraped).getTime();
                  const timeB = new Date(b.result.scraped).getTime();
                  return timeB - timeA;
                })
                .map(({ result, originalIndex: index }) => {
                const viewState = contentViewState[index] || {
                  isOpen: false,
                  viewMode: 'raw',
                  isExpanded: false,
                };
                const hasContent = result.content && result.content.trim().length > 0;
                const contentLength = result.content?.length || 0;
                const needsTruncation = contentLength > 5000;

                const isNew = newResultIndices.has(index);
                
                return (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 hover:border-blue-300 transition-all duration-500 ${
                      isNew ? 'border-blue-400 bg-blue-50 animate-pulse' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1 mr-4">
                        <h3 className="font-medium text-lg text-gray-900">
                          {result.title || 'No title'}
                        </h3>
                        {isNew && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-600 text-white animate-bounce">
                            NEW
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          result.status >= 200 && result.status < 300
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {result.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 break-all mb-2">
                      {result.url}
                    </p>
                    <div className="flex gap-4 text-xs text-gray-700 mb-3">
                      <span>Size: {(result.size / 1024).toFixed(2)} KB</span>
                      <span>Scraped: {formatDate(result.scraped)}</span>
                      {hasContent && (
                        <span>Content: {(contentLength / 1024).toFixed(2)} KB</span>
                      )}
                    </div>
                    {result.error && (
                      <p className="text-sm text-red-600 mt-2 mb-3">{result.error}</p>
                    )}
                    
                    {/* View Content Button */}
                    {hasContent && (
                      <div className="mt-3">
                        <button
                          onClick={() => toggleContentView(index)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm font-medium"
                        >
                          <svg
                            className={`w-4 h-4 transition-transform ${
                              viewState.isOpen ? 'rotate-90' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          {viewState.isOpen ? 'Hide Content' : 'View Content'}
                        </button>

                        {/* Content Display */}
                        {viewState.isOpen && (
                          <div className="mt-4 border-t pt-4">
                            {/* Controls */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => toggleViewMode(index)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                                  style={{
                                    backgroundColor: viewState.viewMode === 'raw' ? '#3b82f6' : 'white',
                                    color: viewState.viewMode === 'raw' ? 'white' : '#374151',
                                    borderColor: viewState.viewMode === 'raw' ? '#3b82f6' : '#d1d5db',
                                  }}
                                >
                                  Raw HTML
                                </button>
                                <button
                                  onClick={() => toggleViewMode(index)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                                  style={{
                                    backgroundColor: viewState.viewMode === 'preview' ? '#3b82f6' : 'white',
                                    color: viewState.viewMode === 'preview' ? 'white' : '#374151',
                                    borderColor: viewState.viewMode === 'preview' ? '#3b82f6' : '#d1d5db',
                                  }}
                                >
                                  Preview
                                </button>
                              </div>
                              <button
                                onClick={() => copyToClipboard(result.content!, index)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                              >
                                {copySuccess === index ? (
                                  <>
                                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-green-600">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Copy
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Raw HTML View */}
                            {viewState.viewMode === 'raw' && (
                              <div className="relative">
                                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs leading-relaxed">
                                  <code>
                                    {viewState.isExpanded || !needsTruncation
                                      ? result.content
                                      : truncateContent(result.content!)}
                                  </code>
                                </pre>
                                {needsTruncation && (
                                  <button
                                    onClick={() => toggleExpand(index)}
                                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                  >
                                    {viewState.isExpanded ? '← Show Less' : 'Show More →'}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Preview View */}
                            {viewState.viewMode === 'preview' && (
                              <div className="relative">
                                <div className="border rounded-lg p-4 bg-white overflow-auto max-h-96">
                                  <div
                                    style={{ color: '#1f2937' }}
                                    className="prose prose-sm max-w-none [&_*]:!text-gray-900"
                                    dangerouslySetInnerHTML={{
                                      __html: sanitizeHTML(
                                        viewState.isExpanded || !needsTruncation
                                          ? result.content!
                                          : truncateContent(result.content!)
                                      ),
                                    }}
                                  />
                                </div>
                                {needsTruncation && (
                                  <button
                                    onClick={() => toggleExpand(index)}
                                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                  >
                                    {viewState.isExpanded ? '← Show Less' : 'Show More →'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {/* No Results Yet */}
        {(!job.results || job.results.length === 0) &&
          job.status !== 'failed' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              {job.status === 'completed' ? (
                <p className="text-gray-600">No results available for this job</p>
              ) : job.status === 'running' ? (
                <div className="flex flex-col items-center gap-3">
                  <svg
                    className="animate-spin h-8 w-8 text-blue-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <p className="text-gray-600 font-medium">
                    Scraping in progress...
                  </p>
                  <p className="text-sm text-gray-500">
                    Results will appear here in real-time as they arrive
                  </p>
                </div>
              ) : (
                <p className="text-gray-600">
                  Waiting for job to start...
                </p>
              )}
            </div>
          )}
      </div>
    </main>
  );
}

