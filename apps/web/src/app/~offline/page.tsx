export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-pump-bg px-6 text-center">
      <p className="text-h3 font-semibold text-pump-text">You&apos;re offline</p>
      <p className="max-w-sm text-body-sm text-pump-muted">
        Pump needs a network connection for live prices, wallet actions, and trades. Reconnect and
        reload to continue.
      </p>
    </main>
  );
}
