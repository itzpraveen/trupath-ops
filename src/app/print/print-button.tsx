"use client";

export function PrintButton() {
  return (
    <div className="no-print mb-4 flex justify-end">
      <button type="button" onClick={() => window.print()} className="rounded-md border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-100">
        Print
      </button>
    </div>
  );
}
