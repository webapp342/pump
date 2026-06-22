import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { isAdminWallet } from "@/config/admin";
import { pumpChain, shortAddress } from "@/config/chain";
import { ADMIN_COPY } from "@/lib/admin/copy";
import { useAdminAuth } from "@/lib/admin/auth-client";

function hasBrowserProvider(): boolean {
  return typeof window !== "undefined" && "ethereum" in window && Boolean(window.ethereum);
}

export function MetaMaskGate({ children }: { children: React.ReactNode }) {
  const { address, isConnected, isConnecting, connector } = useAccount();
  const chainId = useChainId();
  const connectors = useConnectors();
  const { connectAsync, isPending, error: connectError, reset: resetConnect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [localError, setLocalError] = useState<string | null>(null);

  const walletConnector = connectors.find((c) => c.type === "injected") ?? connectors[0];
  const adminAllowed = Boolean(address && isAdminWallet(address));
  const { sessionReady, checking, signingIn, error: authError, signIn, signOut } = useAdminAuth(
    address,
    adminAllowed
  );

  useEffect(() => {
    if (!isConnected || chainId === pumpChain.id) return;
    void switchChainAsync({ chainId: pumpChain.id }).catch(() => {
      // User may reject network switch — stay connected; show hint below.
    });
  }, [isConnected, chainId, switchChainAsync]);

  async function onConnect() {
    setLocalError(null);
    resetConnect();
    if (!walletConnector) {
      setLocalError("No browser wallet connector available. Refresh the page.");
      return;
    }
    try {
      await connectAsync({
        connector: walletConnector,
        chainId: pumpChain.id,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Wallet connection failed");
    }
  }

  const busy = isConnecting || isPending || isSwitching;

  if (busy) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <p className="admin-meta">
            {isSwitching ? "Switch to BSC Testnet in your wallet…" : ADMIN_COPY.auth.connecting}
          </p>
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
            onClick={() => void onConnect()}
          >
            {ADMIN_COPY.auth.connect}
          </button>
          {connectError ? (
            <p className="admin-status-bad mt-4 text-caption">{connectError.message}</p>
          ) : null}
          {localError ? <p className="admin-status-bad mt-4 text-caption">{localError}</p> : null}
        </div>
      </div>
    );
  }

  if (chainId !== pumpChain.id) {
    return (
      <div className="admin-page admin-gate">
        <div className="admin-gate-card">
          <h1 className="admin-title">Switch network</h1>
          <p className="admin-meta mt-3">
            Pump Console requires BSC Testnet (chain {pumpChain.id}). Approve the network switch in
            MetaMask.
          </p>
          <p className="admin-meta mt-2 admin-num">{shortAddress(address)}</p>
          <button
            type="button"
            className="admin-btn admin-btn-primary mt-6 w-full"
            onClick={() => void switchChainAsync({ chainId: pumpChain.id })}
          >
            Switch to BSC Testnet
          </button>
          <button type="button" className="admin-btn mt-3 w-full" onClick={() => disconnect()}>
            {ADMIN_COPY.auth.disconnect}
          </button>
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
          <p className="admin-meta mt-2 admin-num">
            {shortAddress(address)}
            {connector?.name ? ` · ${connector.name}` : ""}
          </p>
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
