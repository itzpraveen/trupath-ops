import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-5xl font-semibold text-muted-foreground">404</p>
        <h1 className="mt-2 text-lg font-semibold">This page does not exist</h1>
        <p className="mt-1 text-sm text-muted-foreground">The link may be old, or the record was removed.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
