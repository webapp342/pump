export const kolMarketEscrowAbi = [
  {
    type: "function",
    name: "lock",
    inputs: [
      { name: "requestId", type: "bytes32" },
      { name: "kol", type: "address" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "release",
    inputs: [{ name: "requestId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "refund",
    inputs: [{ name: "requestId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "escrows",
    inputs: [{ name: "requestId", type: "bytes32" }],
    outputs: [
      { name: "sponsor", type: "address" },
      { name: "kol", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "released", type: "bool" },
      { name: "refunded", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "KolEscrowLocked",
    inputs: [
      { name: "requestId", type: "bytes32", indexed: true },
      { name: "sponsor", type: "address", indexed: true },
      { name: "kol", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
