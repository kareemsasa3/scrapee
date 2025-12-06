'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function NewJobPage() {
  const [url, setUrl] = useState('');
  const [jobName, setJobName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: [url],
          name: jobName || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit job');
      }

      console.log('Job submitted successfully:', data);
      setMessage({ 
        type: 'success', 
        text: `Job submitted successfully! Job ID: ${data.job_id}` 
      });
      
      // Clear form on success
      setUrl('');
      setJobName('');
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
          {/* URL Input */}
          <div>
            <label htmlFor="url" className="block text-sm font-medium mb-2">
              URL <span className="text-red-500">*</span>
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
              Enter the URL you want to scrape
            </p>
          </div>

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
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Enter the URL you want to scrape</li>
            <li>• Submit the job and receive a unique job ID</li>
            <li>• The scraping job will run asynchronously in the background</li>
            <li>• Check the job history page to view results</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

