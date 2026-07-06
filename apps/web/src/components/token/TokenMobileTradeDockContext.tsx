"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TokenMobileTradeDockState = {
  disabled?: boolean;
  pendingSide?: "buy" | "sell" | null;
  onBuy: () => void;
  onSell: () => void;
  onEditAmount: () => void;
};

type TokenMobileTradeDockContextValue = {
  dock: TokenMobileTradeDockState | null;
  setDock: (dock: TokenMobileTradeDockState | null) => void;
};

const TokenMobileTradeDockContext = createContext<TokenMobileTradeDockContextValue | null>(
  null
);

export function TokenMobileTradeDockProvider({ children }: { children: ReactNode }) {
  const [dock, setDock] = useState<TokenMobileTradeDockState | null>(null);
  const value = useMemo(() => ({ dock, setDock }), [dock]);

  return (
    <TokenMobileTradeDockContext.Provider value={value}>
      {children}
    </TokenMobileTradeDockContext.Provider>
  );
}

export function useTokenMobileTradeDock(): TokenMobileTradeDockState | null {
  return useContext(TokenMobileTradeDockContext)?.dock ?? null;
}

export function useRegisterTokenMobileTradeDock(dock: TokenMobileTradeDockState | null) {
  const ctx = useContext(TokenMobileTradeDockContext);

  useEffect(() => {
    if (!ctx) return;
    ctx.setDock(dock);
    return () => ctx.setDock(null);
  }, [ctx, dock]);
}
