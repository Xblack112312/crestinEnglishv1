
export default function CheckoutLoading() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex h-[76px] max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-14">
          <div className="h-5 w-44 animate-pulse bg-neutral-200" />
          <div className="h-4 w-28 animate-pulse bg-neutral-100" />
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-10">
        <div className="h-3 w-32 animate-pulse bg-neutral-200" />

        <div className="mt-6 h-14 w-full max-w-lg animate-pulse bg-neutral-200" />

        <div className="mt-4 h-4 w-full max-w-md animate-pulse bg-neutral-100" />

        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_380px] lg:gap-20">
          <div className="space-y-5">
            <div className="h-7 w-48 animate-pulse bg-neutral-200" />

            <div className="h-32 animate-pulse bg-neutral-100" />

            <div className="h-32 animate-pulse bg-neutral-100" />

            <div className="h-14 animate-pulse bg-neutral-200" />
          </div>

          <div className="space-y-5">
            <div className="aspect-video animate-pulse bg-neutral-100" />
            <div className="h-7 w-3/4 animate-pulse bg-neutral-200" />
            <div className="h-4 w-full animate-pulse bg-neutral-100" />
            <div className="h-16 animate-pulse bg-neutral-100" />
          </div>
        </div>
      </div>
    </main>
  );
}
