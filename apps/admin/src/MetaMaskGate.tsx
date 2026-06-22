import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";
import { isAdminWallet } from "@/config/admin";
import { shortAddress } from "@/config/chain";
import { ADMIN_COPY } from "@/lib/admin/copy";
import { useAdminAuth } from "@/lib/admin/auth-client";

function hasBrowserProvider(): boolean {
  return typeof window !== "undefined" && "ethereum" in window && Boolean(window.ethereum);
}

export function MetaMaskGate({ children }: { children: React.ReactNode }) {
  const { address, isConnected, isConnecting } = useAccount();
  const connectors = useConnectors();
  const { connect, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  const walletConnector = connectors[0];
  const adminAllowed = Boolean(address && isAdminWallet(address));
  const { sessionReady, checking, signingIn, error: authError, signIn, signOut } = useAdminAuth(
    address,
    adminAllowed
  );

  if (isConnecting || isPending) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <p className="admin-meta">{ADMIN_COPY.auth.connecting}</p>
        </div>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <h1 className="admin-title">{ADMIN_COPY.auth.gateTitle}</h1>
          <p className="admin-meta mt-3">{ADMIN_COPY.auth.gateBody}</p>
          {!hasBrowserProvider() ? (
            <p className="admin-status-bad mt-4 text-caption">
              No wallet extension detected. Install MetaMask and refresh this page.
            </p>
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn-primary mt-6 w-full"
            disabled={!walletConnector}
            onClick={() => {
              if (!walletConnector) return;
              connect({ connector: walletConnector });
            }}
          >
            {ADMIN_COPY.auth.connect}
          </button>
          {connectError ? (
            <p className="admin-status-bad mt-4 text-caption">{connectError.message}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!isAdminWallet(address)) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <h1 className="admin-title">{ADMIN_COPY.auth.unauthorizedTitle}</h1>
          <p className="admin-meta mt-3">
            {ADMIN_COPY.auth.unauthorizedBody}{" "}
            <span className="admin-num">({shortAddress(address)})</span>
          </p>
          <button type="button" className="admin-btn mt-6 w-full" onClick={() => disconnect()}>
            {ADMIN_COPY.auth.disconnect}
          </button>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <p className="admin-meta">{ADMIN_COPY.auth.sessionChecking}</p>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <h1 className="admin-title">{ADMIN_COPY.auth.signInTitle}</h1>
          <p className="admin-meta mt-3">{ADMIN_COPY.auth.signInBody}</p>
          <p className="admin-meta mt-2 admin-num">{shortAddress(address)}</p>
          <button
            type="button"
            className="admin-btn admin-btn-primary mt-6 w-full"
            disabled={signingIn}
            onClick={() => void signIn()}
          >
            {signingIn ? ADMIN_COPY.auth.signingIn : ADMIN_COPY.auth.signIn}
          </button>
          {authError ? <p className="admin-status-bad mt-4 text-caption">{authError}</p> : null}
          <button
            type="button"
            className="admin-btn mt-3 w-full"
            onClick={() => {
              void signOut();
              disconnect();
            }}
          >
            {ADMIN_COPY.auth.disconnect}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
