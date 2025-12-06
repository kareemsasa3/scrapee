'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type ScrapeMode = 'single' | 'site';

export default function NewJobPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ScrapeMode>('single');
  const [url, setUrl] = useState('');
  const [jobName, setJobName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string; jobId?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous messages
    setMessage(null);
    
    // Basic validation
    if (!url.trim()) {
      setMessage({ type: 'error', text: 'Please enter a URL' });
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      setMessage({ type: 'error', text: 'Please enter a valid URL (e.g., https://example.com)' });
      return;
    }

    setIsSubmitting(true);

    try {
      // Build request payload based on mode
      // Note: max_pages is not sent to API - it's controlled by server config
      const payload = mode === 'single'
        ? { urls: [url], name: jobName || undefined }
        : { site_url: url, name: jobName || undefined };

      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit job');
      }

      console.log('Job submitted successfully:', data);
      setMessage({ 
        type: 'success', 
        text: `Job submitted successfully! Redirecting to job details...`,
        jobId: data.job_id
      });
      
      // Clear form on success
      setUrl('');
      setJobName('');
      
      // Redirect to job status page after 2 seconds
      setTimeout(() => {
        router.push(`/jobs/${data.job_id}`);
      }, 2000);
    } catch (error) {
      console.error('Error submitting job:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to submit job' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">New Scrape Job</h1>
        <p className="text-gray-600 mb-8">
          Submit a URL to scrape and extract data
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Mode Toggle */}
          <div>
            <label className="block text-sm font-medium mb-3">
              Scrape Mode <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex-1">
                <input
                  type="radio"
                  name="mode"
                  value="single"
                  checked={mode === 'single'}
                  onChange={(e) => setMode(e.target.value as ScrapeMode)}
                  disabled={isSubmitting}
                  className="mr-2"
                />
                <span className="font-medium">Single URL</span>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Scrape one specific URL
                </p>
              </label>
              <label className="flex-1">
                <input
                  type="radio"
                  name="mode"
                  value="site"
                  checked={mode === 'site'}
                  onChange={(e) => setMode(e.target.value as ScrapeMode)}
                  disabled={isSubmitting}
                  className="mr-2"
                />
                <span className="font-medium">Entire Site</span>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Crawl multiple pages from a site
                </p>
              </label>
            </div>
          </div>

          {/* URL Input */}
          <div>
            <label htmlFor="url" className="block text-sm font-medium mb-2">
              {mode === 'single' ? 'URL' : 'Site URL'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={isSubmitting}
            />
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'single' 
                ? 'Enter the URL you want to scrape' 
                : 'Enter the starting URL - the crawler will discover and scrape linked pages'}
            </p>
          </div>

          {/* Site Crawling Info (only for site mode) */}
          {mode === 'site' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="text-sm font-medium text-amber-900 mb-2">
                ⚠️ Site Crawling Requirements
              </h4>
              <div className="text-sm text-amber-800 space-y-2">
                <p>
                  <strong>For multi-page crawling to work:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    <strong>Headless browser must be enabled</strong> - Set the server's 
                    <code className="bg-amber-100 px-1 rounded mx-1">SCRAPER_USE_HEADLESS=true</code>
                  </li>
                  <li>
                    <strong>Website must have pagination links</strong> - Specifically, the HTML structure 
                    <code className="bg-amber-100 px-1 rounded mx-1">&lt;li class="next"&gt;&lt;a&gt;...&lt;/a&gt;&lt;/li&gt;</code>
                  </li>
                  <li>
                    <strong>Max pages</strong> is controlled by server config (default: 10 pages)
                  </li>
                </ul>
                <p className="mt-2 text-xs">
                  <strong>Note:</strong> If headless mode is disabled (default), only the starting URL will be scraped.
                </p>
              </div>
            </div>
          )}

          {/* Job Name/Description */}
          <div>
            <label htmlFor="jobName" className="block text-sm font-medium mb-2">
              Job Name (Optional)
            </label>
            <input
              type="text"
              id="jobName"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="My scraping job"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={isSubmitting}
            />
            <p className="text-sm text-gray-500 mt-1">
              Optional name to help you identify this job
            </p>
          </div>

          {/* Message Display */}
          {message && (
            <div
              className={`p-4 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              <p className="font-medium">
                {message.type === 'success' ? '✓ Success' : '✗ Error'}
              </p>
              <p className="text-sm mt-1">{message.text}</p>
              {message.jobId && (
                <p className="text-xs mt-2 font-mono">Job ID: {message.jobId}</p>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                isSubmitting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
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
                  Submitting...
                </span>
              ) : (
                'Submit Job'
              )}
            </button>

            <Link
              href="/"
              className="px-6 py-3 rounded-lg font-medium border border-gray-300 hover:bg-gray-50 transition-colors text-center"
            >
              Cancel
            </Link>
          </div>
        </form>

        {/* Info Section */}
        <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">💡 How it works</h3>
          {mode === 'single' ? (
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Enter the specific URL you want to scrape</li>
              <li>• The scraper will fetch and extract data from that single page</li>
              <li>• Submit the job and receive a unique job ID</li>
              <li>• The scraping job will run asynchronously in the background</li>
            </ul>
          ) : (
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Enter the starting URL of the site you want to crawl</li>
              <li>• The crawler looks for pagination links (e.g., "Next" buttons) on each page</li>
              <li>• Requires headless browser mode to be enabled on the server</li>
              <li>• Works best with sites that have standard pagination structure</li>
              <li>• The job runs asynchronously and you can monitor progress in real-time</li>
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

