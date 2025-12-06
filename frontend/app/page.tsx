import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Scrapee</h1>
        <p className="text-gray-600 mb-8">
          A user-friendly interface for the Arachne web scraping engine
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/jobs"
            className="p-6 border rounded-lg hover:border-blue-500 transition-colors"
          >
            <h2 className="text-2xl font-semibold mb-2">New Scrape Job</h2>
            <p className="text-gray-600">Submit a new web scraping job</p>
          </Link>
          
          <Link
            href="/history"
            className="p-6 border rounded-lg hover:border-blue-500 transition-colors"
          >
            <h2 className="text-2xl font-semibold mb-2">Job History</h2>
            <p className="text-gray-600">View past scraping jobs and results</p>
          </Link>
        </div>
      </div>
    </main>
  );
}