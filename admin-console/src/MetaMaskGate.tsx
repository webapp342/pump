import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";
import { isAdminWallet } from "@/config/admin";
import { shortAddress } from "@/config/chain";

function hasBrowserProvider(): boolean {
  return typeof window !== "undefined" && "ethereum" in window && Boolean(window.ethereum);
}

export function MetaMaskGate({ children }: { children: React.ReactNode }) {
  const { address, isConnected, isConnecting } = useAccount();
  const connectors = useConnectors();
  const { connect, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  const walletConnector = connectors[0];

  if (isConnecting || isPending) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <p className="admin-meta">Connecting wallet…</p>
        </div>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <h1 className="admin-title">Pump Admin</h1>
          <p className="admin-meta mt-3">
            Connect the operations wallet configured in{" "}
            <code className="admin-num">NEXT_PUBLIC_ADMIN_ADDRESS</code>.
          </p>
          {!hasBrowserProvider() ? (
            <p className="admin-status-bad mt-4 text-caption">
              No wallet extension detected. Install MetaMask and refresh.
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
            Connect wallet
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
          <h1 className="admin-title">Not authorized</h1>
          <p className="admin-meta mt-3">
            Connected wallet{" "}
            <span className="admin-num">{shortAddress(address)}</span> is not the configured admin
            address.
          </p>
          <button type="button" className="admin-btn mt-6 w-full" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
