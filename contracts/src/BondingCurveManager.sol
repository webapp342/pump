// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20Minimal} from "./interfaces/ILaunchpad.sol";

/// @notice Native BNB <-> meme token bonding-curve trading (BSC pump; no graduation).
/// @dev MVP skeleton with virtual-reserve constant-product pricing.
contract BondingCurveManager {
    struct CurveState {
        address token;
        address creator;
        uint256 reserveZug;
        uint256 soldTokens;
        uint256 targetZug;
        uint256 virtualZugReserve;
        uint256 virtualTokenReserve;
        bool paused;
    }

    address public owner;
    address public factory;
    address public treasury;

    uint256 public protocolFeeBps = 100; // 1%
    uint256 public creatorFeeShareBps = 2_000; // 20% of collected protocol fee
    uint256 public referrerShareBps = 500; // 5% of collected protocol fee
    uint256 public constant BPS = 10_000;

    mapping(address => CurveState) public curves;
    mapping(address => uint256) public pendingCreatorFees;
    mapping(address => uint256) public pendingReferrerFees;
    mapping(address => address) public traderReferrer;
    mapping(address => bool) public hasTraded;

    bool private locked;

    event TokenRegistered(
        address indexed token,
        address indexed creator,
        uint256 totalSupply,
        uint256 targetZug,
        uint256 virtualZugReserve,
        uint256 virtualTokenReserve
    );
    event Trade(
        address indexed token,
        address indexed trader,
        bool indexed isBuy,
        uint256 zugAmount,
        uint256 tokenAmount,
        uint256 feeZug,
        uint256 reserveZug,
        uint256 soldTokens
    );
    event FeeSplit(
        address indexed token,
        address indexed creator,
        address indexed trader,
        uint256 creatorFee,
        uint256 referrerFee,
        uint256 treasuryFee
    );
    event CreatorFeeClaimed(address indexed creator, uint256 amount);
    event ReferrerSet(address indexed trader, address indexed referrer);
    event ReferrerFeeClaimed(address indexed referrer, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotFactory();
    error Reentrancy();
    error ZeroAddress();
    error InvalidConfig();
    error UnknownToken();
    error Paused();
    error Slippage();
    error TransferFailed();
    error InsufficientOutput();
    error ReferrerAlreadySet();
    error AlreadyTraded();
    error SelfReferrer();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    constructor(address owner_, address treasury_) {
        if (owner_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        owner = owner_;
        treasury = treasury_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setFactory(address factory_) external onlyOwner {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
    }

    function setProtocolFeeBps(uint256 feeBps) external onlyOwner {
        if (feeBps > 1_000) revert InvalidConfig(); // max 10%
        protocolFeeBps = feeBps;
    }

    function setCreatorFeeShareBps(uint256 shareBps) external onlyOwner {
        if (shareBps > 5_000) revert InvalidConfig(); // creator can receive max 50% of protocol fee
        if (shareBps + referrerShareBps > BPS) revert InvalidConfig();
        creatorFeeShareBps = shareBps;
    }

    function setReferrerShareBps(uint256 shareBps) external onlyOwner {
        if (creatorFeeShareBps + shareBps > BPS) revert InvalidConfig();
        referrerShareBps = shareBps;
    }

    function setReferrer(address referrer) external {
        if (referrer == address(0)) revert ZeroAddress();
        if (referrer == msg.sender) revert SelfReferrer();
        if (hasTraded[msg.sender]) revert AlreadyTraded();
        if (traderReferrer[msg.sender] != address(0)) revert ReferrerAlreadySet();

        traderReferrer[msg.sender] = referrer;
        emit ReferrerSet(msg.sender, referrer);
    }

    /// @notice Bind referrer and buy in one tx (no separate setReferrer signature).
    function buyWithReferrer(
        address token,
        uint256 minTokenOut,
        address referrer
    ) external payable nonReentrant returns (uint256 tokenOut) {
        _bindReferrerIfEligible(msg.sender, referrer);
        tokenOut = _buy(token, msg.sender, minTokenOut);
    }

    /// @notice Bind referrer and sell in one tx when first trade is a sell.
    function sellWithReferrer(
        address token,
        uint256 tokenIn,
        uint256 minZugOut,
        address referrer
    ) external nonReentrant returns (uint256 zugOut) {
        _bindReferrerIfEligible(msg.sender, referrer);
        zugOut = _sell(token, msg.sender, tokenIn, minZugOut);
    }

    function registerToken(
        address token,
        address creator,
        uint256 totalSupply,
        uint256 targetZug,
        uint256 virtualZugReserve,
        uint256 virtualTokenReserve
    ) external onlyFactory {
        if (token == address(0) || creator == address(0)) revert ZeroAddress();
        if (curves[token].token != address(0)) revert InvalidConfig();
        if (totalSupply == 0 || targetZug == 0 || virtualZugReserve == 0 || virtualTokenReserve == 0) {
            revert InvalidConfig();
        }
        if (virtualTokenReserve != totalSupply) revert InvalidConfig();
        if (IERC20Minimal(token).balanceOf(address(this)) < totalSupply) revert InvalidConfig();

        curves[token] = CurveState({
            token: token,
            creator: creator,
            reserveZug: 0,
            soldTokens: 0,
            targetZug: targetZug,
            virtualZugReserve: virtualZugReserve,
            virtualTokenReserve: virtualTokenReserve,
            paused: false
        });

        emit TokenRegistered(token, creator, totalSupply, targetZug, virtualZugReserve, virtualTokenReserve);
    }

    function quoteBuy(address token, uint256 zugIn) public view returns (uint256 tokenOut, uint256 feeZug) {
        CurveState memory c = curves[token];
        if (c.token == address(0)) revert UnknownToken();

        feeZug = (zugIn * protocolFeeBps) / BPS;
        uint256 netZug = zugIn - feeZug;

        uint256 x0 = c.virtualZugReserve + c.reserveZug;
        uint256 y0 = c.virtualTokenReserve - c.soldTokens;
        uint256 k = x0 * y0;
        uint256 y1 = k / (x0 + netZug);
        tokenOut = y0 - y1;
    }

    function quoteSell(address token, uint256 tokenIn) public view returns (uint256 zugOut, uint256 feeZug) {
        CurveState memory c = curves[token];
        if (c.token == address(0)) revert UnknownToken();

        uint256 x0 = c.virtualZugReserve + c.reserveZug;
        uint256 y0 = c.virtualTokenReserve - c.soldTokens;
        uint256 k = x0 * y0;
        uint256 x1 = k / (y0 + tokenIn);
        uint256 grossZugOut = x0 - x1;

        if (grossZugOut > c.reserveZug) grossZugOut = c.reserveZug;
        feeZug = (grossZugOut * protocolFeeBps) / BPS;
        zugOut = grossZugOut - feeZug;
    }

    function buy(address token, uint256 minTokenOut) external payable nonReentrant returns (uint256 tokenOut) {
        tokenOut = _buy(token, msg.sender, minTokenOut);
    }

    function buyFor(
        address token,
        address recipient,
        uint256 minTokenOut
    ) external payable nonReentrant returns (uint256 tokenOut) {
        if (recipient == address(0)) revert ZeroAddress();
        tokenOut = _buy(token, recipient, minTokenOut);
    }

    function _buy(address token, address recipient, uint256 minTokenOut) internal returns (uint256 tokenOut) {
        CurveState storage c = curves[token];
        if (c.token == address(0)) revert UnknownToken();
        if (c.paused) revert Paused();

        uint256 feeZug;
        (tokenOut, feeZug) = quoteBuy(token, msg.value);
        if (tokenOut < minTokenOut) revert Slippage();
        if (tokenOut == 0) revert InsufficientOutput();

        c.reserveZug += (msg.value - feeZug);
        c.soldTokens += tokenOut;

        if (!IERC20Minimal(token).transfer(recipient, tokenOut)) revert TransferFailed();
        hasTraded[recipient] = true;
        _distributeFee(token, c.creator, recipient, feeZug);

        emit Trade(token, recipient, true, msg.value, tokenOut, feeZug, c.reserveZug, c.soldTokens);
    }

    function sell(address token, uint256 tokenIn, uint256 minZugOut) external nonReentrant returns (uint256 zugOut) {
        zugOut = _sell(token, msg.sender, tokenIn, minZugOut);
    }

    function _bindReferrerIfEligible(address trader, address referrer) internal {
        if (referrer == address(0) || referrer == trader) return;
        if (hasTraded[trader]) return;
        if (traderReferrer[trader] != address(0)) return;

        traderReferrer[trader] = referrer;
        emit ReferrerSet(trader, referrer);
    }

    function _sell(
        address token,
        address trader,
        uint256 tokenIn,
        uint256 minZugOut
    ) internal returns (uint256 zugOut) {
        CurveState storage c = curves[token];
        if (c.token == address(0)) revert UnknownToken();
        if (c.paused) revert Paused();

        uint256 feeZug;
        (zugOut, feeZug) = quoteSell(token, tokenIn);
        if (zugOut < minZugOut) revert Slippage();
        if (zugOut == 0) revert InsufficientOutput();

        if (!IERC20Minimal(token).transferFrom(trader, address(this), tokenIn)) revert TransferFailed();

        c.reserveZug -= (zugOut + feeZug);
        c.soldTokens -= tokenIn;

        _sendNative(payable(trader), zugOut);
        hasTraded[trader] = true;
        _distributeFee(token, c.creator, trader, feeZug);

        emit Trade(token, trader, false, zugOut + feeZug, tokenIn, feeZug, c.reserveZug, c.soldTokens);
    }

    function pauseToken(address token, bool paused) external onlyOwner {
        if (curves[token].token == address(0)) revert UnknownToken();
        curves[token].paused = paused;
    }

    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        amount = pendingCreatorFees[msg.sender];
        pendingCreatorFees[msg.sender] = 0;
        _sendNative(payable(msg.sender), amount);
        emit CreatorFeeClaimed(msg.sender, amount);
    }

    function claimReferrerFees() external nonReentrant returns (uint256 amount) {
        amount = pendingReferrerFees[msg.sender];
        pendingReferrerFees[msg.sender] = 0;
        _sendNative(payable(msg.sender), amount);
        emit ReferrerFeeClaimed(msg.sender, amount);
    }

    function _sendNative(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _distributeFee(address token, address creator, address trader, uint256 feeZug) internal {
        if (feeZug == 0) return;

        uint256 creatorFee = (feeZug * creatorFeeShareBps) / BPS;
        address referrer = traderReferrer[trader];
        uint256 referrerFee = referrer != address(0) ? (feeZug * referrerShareBps) / BPS : 0;
        uint256 treasuryFee = feeZug - creatorFee - referrerFee;

        pendingCreatorFees[creator] += creatorFee;
        if (referrerFee > 0) {
            pendingReferrerFees[referrer] += referrerFee;
        }
        _sendNative(payable(treasury), treasuryFee);

        emit FeeSplit(token, creator, trader, creatorFee, referrerFee, treasuryFee);
    }
}
