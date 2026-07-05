import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-purple-500">404</h1>
        <p className="mt-4 text-2xl font-semibold">Page not found</p>
        <p className="mt-2 text-gray-400">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-block rounded-lg bg-purple-600 px-6 py-3 font-medium hover:bg-purple-700 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
