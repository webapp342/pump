export type CandleWsUpdatePayload = {
  interval: string;
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  buyVolume: string;
  tradeCount: number;
  isNewBucket: boolean;
};

export type TradePublishPayload = {
  type: "trade";
  seq?: number;
  tokenAddress: string;
  candleUpdates?: CandleWsUpdatePayload[];
  trade: {
    id: string;
    side: string;
    traderAddress: string;
    zugAmount: string;
    feeZug?: string;
    tokenAmount: string;
    priceZug: string;
    txHash: string;
    logIndex: number;
    blockTime: string;
    nativeUsdRate?: string;
  };
  bonding: {
    reserveZug: string;
    tokenSold?: string;
    marketCapZug: string;
    spotPriceZug?: string;
    lastPriceZug: string;
    progressBps: number;
    tradeCount: number;
    holderCount: number;
    volume24hZug?: string;
    traders24h?: number;
  };
};
