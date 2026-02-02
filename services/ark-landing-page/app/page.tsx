'use client';

import { useEffect, useState } from 'react';

interface Demo {
  name: string;
  displayName: string;
  description: string;
}

export default function LandingPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/demos')
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch demos: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }
        setDemos(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load demos:', err);
        setError('Failed to load demos. Check console for details.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading demos...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl text-red-600">{error}</div>
      </main>
    );
  }

  // Map demo names to localhost ports for development
  const demoPortMap: Record<string, number> = {
    'kyc-demo': 3003,
    'demo-sales': 3003, // Legacy compatibility
  };

  const getDemoUrl = (demoName: string) => {
    // In development with port-forward, use localhost:PORT
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      const port = demoPortMap[demoName] || 3000;
      return `http://localhost:${port}?namespace=${demoName}`;
    }
    // In production, use proper DNS
    return `http://${demoName}.127.0.0.1.nip.io`;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            ARK Demos
          </h1>
          <p className="text-xl text-gray-600">
            Explore agentic AI demonstrations
          </p>
        </div>

        {demos.length === 0 ? (
          <div className="text-center text-gray-600">
            No demos available at the moment.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {demos.map((demo) => (
              <a
                key={demo.name}
                href={getDemoUrl(demo.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow duration-300 block"
              >
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  {demo.displayName}
                </h2>
                <p className="text-gray-600 mb-6">
                  {demo.description || 'AI agent demonstration'}
                </p>
                <div className="text-blue-600 font-medium flex items-center">
                  Access Demo
                  <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        )}

        <div className="mt-16 text-center">
          <div className="inline-block bg-blue-100 border border-blue-300 rounded-lg px-6 py-4">
            <p className="text-blue-800">
              <span className="font-semibold">Demo Environment:</span> Each demo runs in its own isolated namespace with pre-loaded agents, teams, and models.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
