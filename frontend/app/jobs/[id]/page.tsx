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

        {/* Results Section */}
        {job.results && job.results.length > 0 && (
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Results ({job.results.length})
            </h2>
            <div className="space-y-3">
              {job.results.map((result, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-lg text-gray-900 flex-1 mr-4">
                      {result.title || 'No title'}
                    </h3>
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
                  <div className="flex gap-4 text-xs text-gray-700">
                    <span>Size: {(result.size / 1024).toFixed(2)} KB</span>
                    <span>Scraped: {formatDate(result.scraped)}</span>
                  </div>
                  {result.error && (
                    <p className="text-sm text-red-600 mt-2">{result.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Results Yet */}
        {(!job.results || job.results.length === 0) &&
          job.status !== 'failed' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <p className="text-gray-600">
                {job.status === 'completed'
                  ? 'No results available for this job'
                  : 'Results will appear here once scraping is complete'}
              </p>
            </div>
          )}
      </div>
    </main>
  );
}

