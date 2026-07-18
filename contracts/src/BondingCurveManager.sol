// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {IERC20Minimal} from "./interfaces/ILaunchpad.sol";
import {IERC20Permit} from "./interfaces/IERC20Permit.sol";

/// @notice UUPS-upgradeable native ETH <-> meme token bonding-curve trading (no graduation).
contract BondingCurveManager is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    struct CurveState {
        address token;
        address creator;
        uint256 reserveEth;
        uint256 soldTokens;
        /// @dev Legacy storage slot (was graduation target). Always zero for new tokens.
        uint256 progressGoalEth;
        uint256 virtualEthReserve;
        uint256 virtualTokenReserve;
        bool paused;
    }

    struct SellInput {
        address token;
        uint256 tokenIn;
        uint256 minEthOut;
    }

    struct SellPermitInput {
        address token;
        uint256 tokenIn;
        uint256 minEthOut;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    address public factory;
    address public treasury;

    uint256 public protocolFeeBps;
    uint256 public creatorFeeShareBps;
    uint256 public referrerShareBps;
    uint256 public verifiedReferrerShareBps;
    mapping(address => bool) public verifiedKol;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_SELL_BATCH = 10;
    uint256 internal constant PERMIT_ALLOWANCE_MAX = type(uint256).max;

    mapping(address => CurveState) public curves;
    mapping(address => uint256) public pendingCreatorFees;
    mapping(address => uint256) public pendingReferrerFees;
    mapping(address => address) public traderReferrer;
    mapping(address => bool) public hasTraded;
    bool public emergencyHalt;

    event TokenRegistered(
        address indexed token,
        address indexed creator,
        uint256 totalSupply,
        uint256 virtualEthReserve,
        uint256 virtualTokenReserve
    );
    event Trade(
        address indexed token,
        address indexed trader,
        bool indexed isBuy,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 feeEth,
        uint256 reserveEth,
        uint256 soldTokens,
        uint256 spotPriceWei
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
    event VerifiedKolSet(address indexed kol, bool verified);
    event VerifiedReferrerShareUpdated(uint256 shareBps);
    event EmergencyHaltSet(bool halted);
    event EmergencyEthSwept(address indexed to, uint256 amount);

    error NotFactory();
    error ZeroAddress();
    error InvalidConfig();
    error InvalidBatch();
    error UnknownToken();
    error Paused();
    error Slippage();
    error TransferFailed();
    error InsufficientOutput();
    error ReferrerAlreadySet();
    error AlreadyTraded();
    error SelfReferrer();
    error EmergencyHalted();
    error NothingToSweep();

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address treasury_) external initializer {
        if (treasury_ == address(0)) revert ZeroAddress();
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        treasury = treasury_;
        protocolFeeBps = 100;
        creatorFeeShareBps = 2_000;
        referrerShareBps = 500;
        verifiedReferrerShareBps = 2_500;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setFactory(address factory_) external onlyOwner {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
    }

    function setProtocolFeeBps(uint256 feeBps) external onlyOwner {
        if (feeBps > 1_000) revert InvalidConfig();
        protocolFeeBps = feeBps;
    }

    function setCreatorFeeShareBps(uint256 shareBps) external onlyOwner {
        if (shareBps > 5_000) revert InvalidConfig();
        if (shareBps + referrerShareBps > BPS) revert InvalidConfig();
        creatorFeeShareBps = shareBps;
    }

    function setReferrerShareBps(uint256 shareBps) external onlyOwner {
        if (creatorFeeShareBps + shareBps > BPS) revert InvalidConfig();
        referrerShareBps = shareBps;
    }

    function setVerifiedReferrerShareBps(uint256 shareBps) external onlyOwner {
        if (creatorFeeShareBps + shareBps > BPS) revert InvalidConfig();
        verifiedReferrerShareBps = shareBps;
        emit VerifiedReferrerShareUpdated(shareBps);
    }

    function setVerifiedKol(address kol, bool verified) external onlyOwner {
        if (kol == address(0)) revert ZeroAddress();
        verifiedKol[kol] = verified;
        emit VerifiedKolSet(kol, verified);
    }

    function setReferrer(address referrer) external {
        if (referrer == address(0)) revert ZeroAddress();
        if (referrer == msg.sender) revert SelfReferrer();
        if (hasTraded[msg.sender]) revert AlreadyTraded();
        if (traderReferrer[msg.sender] != address(0)) revert ReferrerAlreadySet();

        traderReferrer[msg.sender] = referrer;
        emit ReferrerSet(msg.sender, referrer);
    }

    function buyWithReferrer(
        address token,
        uint256 minTokenOut,
        address referrer
    ) external payable nonReentrant returns (uint256 tokenOut) {
        _bindReferrerIfEligible(msg.sender, referrer);
        tokenOut = _buy(token, msg.sender, minTokenOut);
    }

    function sellWithReferrer(
        address token,
        uint256 tokenIn,
        uint256 minEthOut,
        address referrer
    ) external nonReentrant returns (uint256 ethOut) {
        _bindReferrerIfEligible(msg.sender, referrer);
        ethOut = _sell(token, msg.sender, tokenIn, minEthOut);
    }

    function registerToken(
        address token,
        address creator,
        uint256 totalSupply,
        uint256 virtualEthReserve,
        uint256 virtualTokenReserve
    ) external onlyFactory {
        if (token == address(0) || creator == address(0)) revert ZeroAddress();
        if (curves[token].token != address(0)) revert InvalidConfig();
        if (totalSupply == 0 || virtualEthReserve == 0 || virtualTokenReserve == 0) {
            revert InvalidConfig();
        }
        if (virtualTokenReserve != totalSupply) revert InvalidConfig();
        if (IERC20Minimal(token).balanceOf(address(this)) < totalSupply) revert InvalidConfig();

        curves[token] = CurveState({
            token: token,
            creator: creator,
            reserveEth: 0,
            soldTokens: 0,
            progressGoalEth: 0,
            virtualEthReserve: virtualEthReserve,
            virtualTokenReserve: virtualTokenReserve,
            paused: false
        });

        emit TokenRegistered(token, creator, totalSupply, virtualEthReserve, virtualTokenReserve);
    }

    /// @notice ETH per 1 full token (1e18 token wei) from constant-product reserves.
    function spotPriceWei(address token) public view returns (uint256) {
        return _spotPriceWei(curves[token]);
    }

    function quoteBuy(address token, uint256 ethIn) public view returns (uint256 tokenOut, uint256 feeEth) {
        CurveState memory c = curves[token];
        if (c.token == address(0)) revert UnknownToken();

        feeEth = (ethIn * protocolFeeBps) / BPS;
        uint256 netEth = ethIn - feeEth;

        uint256 x0 = c.virtualEthReserve + c.reserveEth;
        uint256 y0 = c.virtualTokenReserve - c.soldTokens;
        uint256 k = x0 * y0;
        uint256 y1 = k / (x0 + netEth);
        tokenOut = y0 - y1;
    }

    function quoteSell(address token, uint256 tokenIn) public view returns (uint256 ethOut, uint256 feeEth) {
        CurveState memory c = curves[token];
        if (c.token == address(0)) revert UnknownToken();

        uint256 x0 = c.virtualEthReserve + c.reserveEth;
        uint256 y0 = c.virtualTokenReserve - c.soldTokens;
        uint256 k = x0 * y0;
        uint256 x1 = k / (y0 + tokenIn);
        uint256 grossEthOut = x0 - x1;

        if (grossEthOut > c.reserveEth) grossEthOut = c.reserveEth;
        feeEth = (grossEthOut * protocolFeeBps) / BPS;
        ethOut = grossEthOut - feeEth;
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

    function sell(address token, uint256 tokenIn, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        ethOut = _sell(token, msg.sender, tokenIn, minEthOut);
    }

    function sellWithPermit(
        address token,
        uint256 tokenIn,
        uint256 minEthOut,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 ethOut) {
        IERC20Permit(token).permit(msg.sender, address(this), PERMIT_ALLOWANCE_MAX, deadline, v, r, s);
        ethOut = _sell(token, msg.sender, tokenIn, minEthOut);
    }

    function sellWithReferrerAndPermit(
        address token,
        uint256 tokenIn,
        uint256 minEthOut,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address referrer
    ) external nonReentrant returns (uint256 ethOut) {
        _bindReferrerIfEligible(msg.sender, referrer);
        IERC20Permit(token).permit(msg.sender, address(this), PERMIT_ALLOWANCE_MAX, deadline, v, r, s);
        ethOut = _sell(token, msg.sender, tokenIn, minEthOut);
    }

    function sellBatch(SellInput[] calldata sells) external nonReentrant returns (uint256[] memory ethOuts) {
        uint256 length = sells.length;
        if (length == 0 || length > MAX_SELL_BATCH) revert InvalidBatch();

        address trader = msg.sender;
        ethOuts = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            SellInput calldata input = sells[i];
            ethOuts[i] = _sell(input.token, trader, input.tokenIn, input.minEthOut);
        }
    }

    function sellBatchWithPermit(SellPermitInput[] calldata sells)
        external
        nonReentrant
        returns (uint256[] memory ethOuts)
    {
        uint256 length = sells.length;
        if (length == 0 || length > MAX_SELL_BATCH) revert InvalidBatch();

        address trader = msg.sender;
        ethOuts = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            SellPermitInput calldata input = sells[i];
            IERC20Permit(input.token).permit(trader, address(this), PERMIT_ALLOWANCE_MAX, input.deadline, input.v, input.r, input.s);
            ethOuts[i] = _sell(input.token, trader, input.tokenIn, input.minEthOut);
        }
    }

    function pauseToken(address token, bool paused) external onlyOwner {
        if (curves[token].token == address(0)) revert UnknownToken();
        curves[token].paused = paused;
    }

    function setEmergencyHalt(bool halted) external onlyOwner {
        emergencyHalt = halted;
        emit EmergencyHaltSet(halted);
    }

    /// @notice Drains the full native balance to `to` and halts all trading (hack / incident response).
    function emergencySweepAllEth(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToSweep();

        emergencyHalt = true;
        emit EmergencyHaltSet(true);

        _sendNative(payable(to), amount);
        emit EmergencyEthSwept(to, amount);
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

    function _spotPriceWei(CurveState memory c) internal pure returns (uint256) {
        uint256 y = c.virtualTokenReserve - c.soldTokens;
        if (y == 0) return 0;
        uint256 x = c.virtualEthReserve + c.reserveEth;
        return (x * 1e18) / y;
    }

    function _buy(address token, address recipient, uint256 minTokenOut) internal returns (uint256 tokenOut) {
        if (emergencyHalt) revert EmergencyHalted();

        CurveState storage c = curves[token];
        if (c.token == address(0)) revert UnknownToken();
        if (c.paused) revert Paused();

        uint256 feeEth;
        (tokenOut, feeEth) = quoteBuy(token, msg.value);
        if (tokenOut < minTokenOut) revert Slippage();
        if (tokenOut == 0) revert InsufficientOutput();

        c.reserveEth += (msg.value - feeEth);
        c.soldTokens += tokenOut;

        if (!IERC20Minimal(token).transfer(recipient, tokenOut)) revert TransferFailed();
        hasTraded[recipient] = true;
        _distributeFee(token, c.creator, recipient, feeEth);

        emit Trade(
            token,
            recipient,
            true,
            msg.value,
            tokenOut,
            feeEth,
            c.reserveEth,
            c.soldTokens,
            _spotPriceWei(c)
        );
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
        uint256 minEthOut
    ) internal returns (uint256 ethOut) {
        if (emergencyHalt) revert EmergencyHalted();

        CurveState storage c = curves[token];
        if (c.token == address(0)) revert UnknownToken();
        if (c.paused) revert Paused();

        uint256 feeEth;
        (ethOut, feeEth) = quoteSell(token, tokenIn);
        if (ethOut < minEthOut) revert Slippage();
        if (ethOut == 0) revert InsufficientOutput();

        if (!IERC20Minimal(token).transferFrom(trader, address(this), tokenIn)) revert TransferFailed();

        c.reserveEth -= (ethOut + feeEth);
        c.soldTokens -= tokenIn;

        _sendNative(payable(trader), ethOut);
        hasTraded[trader] = true;
        _distributeFee(token, c.creator, trader, feeEth);

        emit Trade(
            token,
            trader,
            false,
            ethOut + feeEth,
            tokenIn,
            feeEth,
            c.reserveEth,
            c.soldTokens,
            _spotPriceWei(c)
        );
    }

    function _sendNative(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _distributeFee(address token, address creator, address trader, uint256 feeEth) internal {
        if (feeEth == 0) return;

        uint256 creatorFee = (feeEth * creatorFeeShareBps) / BPS;
        address referrer = traderReferrer[trader];
        uint256 refShareBps = referrer != address(0) && verifiedKol[referrer]
            ? verifiedReferrerShareBps
            : referrerShareBps;
        uint256 referrerFee = referrer != address(0) ? (feeEth * refShareBps) / BPS : 0;
        uint256 treasuryFee = feeEth - creatorFee - referrerFee;

        pendingCreatorFees[creator] += creatorFee;
        if (referrerFee > 0) {
            pendingReferrerFees[referrer] += referrerFee;
        }
        _sendNative(payable(treasury), treasuryFee);

        emit FeeSplit(token, creator, trader, creatorFee, referrerFee, treasuryFee);
    }

    uint256[39] private __gap;
}
