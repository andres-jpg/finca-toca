export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded bg-stone-200 animate-pulse" />
          <div className="h-4 w-56 rounded bg-stone-100 animate-pulse" />
        </div>
        <div className="h-9 w-48 rounded-lg bg-stone-100 animate-pulse" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-stone-200 p-6 h-32 animate-pulse"
          />
        ))}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 h-72 animate-pulse" />
      <div className="bg-white rounded-xl border border-stone-200 h-72 animate-pulse" />
      <div className="bg-white rounded-xl border border-stone-200 h-72 animate-pulse" />
    </div>
  );
}
