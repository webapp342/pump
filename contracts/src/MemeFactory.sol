// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {IBondingCurveManager} from "./interfaces/ILaunchpad.sol";
import {MemeTokenImplementation} from "./MemeTokenImplementation.sol";

/// @notice UUPS-upgradeable meme factory. New tokens are EIP-1167 clones of `memeTokenImplementation`.
contract MemeFactory is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    address public treasury;
    IBondingCurveManager public bondingCurveManager;
    address public memeTokenImplementation;

    uint256 public createFee;
    uint256 public minInitialBuyWei;
    uint256 public defaultTotalSupply;
    /// @dev Legacy graduation-goal slot (`defaultTargetZug`). Unused; kept for UUPS layout.
    uint256 private _deprecatedProgressGoalEth;
    uint256 public defaultVirtualEthReserve;
    uint256 public defaultVirtualTokenReserve;

    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_SYMBOL_LENGTH = 16;
    uint256 public constant MAX_METADATA_URI_LENGTH = 256;

    mapping(address => address[]) public creatorTokens;
    mapping(address => bool) public isLaunchpadToken;
    mapping(address => bool) public feeExempt;

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string metadataURI,
        uint256 totalSupply,
        uint256 virtualEthReserve,
        uint256 createdAt
    );
    event ConfigUpdated(
        address indexed treasury,
        address indexed bondingCurveManager,
        uint256 createFee,
        uint256 defaultVirtualEthReserve
    );
    event MinInitialBuyUpdated(uint256 previousMinWei, uint256 newMinWei);
    event FeeExemptUpdated(address indexed account, bool exempt);
    event MemeTokenImplementationUpdated(address indexed previousImpl, address indexed newImpl);

    error ZeroAddress();
    error InvalidInput();
    error FeeTooLow();
    error InitialBuyTooLow();
    error TransferFailed();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address owner_,
        address treasury_,
        address bondingCurveManager_,
        address memeTokenImplementation_
    ) external initializer {
        if (treasury_ == address(0) || bondingCurveManager_ == address(0) || memeTokenImplementation_ == address(0)) {
            revert ZeroAddress();
        }

        __Ownable_init(owner_);
        __UUPSUpgradeable_init();

        treasury = treasury_;
        bondingCurveManager = IBondingCurveManager(bondingCurveManager_);
        memeTokenImplementation = memeTokenImplementation_;

        defaultTotalSupply = 1_000_000_000 ether;
        defaultVirtualEthReserve = 5 ether;
        defaultVirtualTokenReserve = 1_000_000_000 ether;

        feeExempt[owner_] = true;
        emit FeeExemptUpdated(owner_, true);
        emit ConfigUpdated(treasury_, bondingCurveManager_, createFee, defaultVirtualEthReserve);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setMemeTokenImplementation(address implementation_) external onlyOwner {
        if (implementation_ == address(0)) revert ZeroAddress();
        address previous = memeTokenImplementation;
        memeTokenImplementation = implementation_;
        emit MemeTokenImplementationUpdated(previous, implementation_);
    }

    function setFeeExempt(address account, bool exempt) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        feeExempt[account] = exempt;
        emit FeeExemptUpdated(account, exempt);
    }

    function setMinInitialBuyWei(uint256 minInitialBuyWei_) external onlyOwner {
        uint256 previous = minInitialBuyWei;
        minInitialBuyWei = minInitialBuyWei_;
        emit MinInitialBuyUpdated(previous, minInitialBuyWei_);
    }

    function createMeme(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 minInitialBuyTokens
    ) external payable returns (address token) {
        if (
            bytes(name).length == 0 ||
            bytes(name).length > MAX_NAME_LENGTH ||
            bytes(symbol).length == 0 ||
            bytes(symbol).length > MAX_SYMBOL_LENGTH ||
            bytes(metadataURI).length > MAX_METADATA_URI_LENGTH
        ) revert InvalidInput();

        uint256 feeDue = _createFeeFor(msg.sender);
        if (msg.value < feeDue) revert FeeTooLow();

        uint256 initialBuyValue = msg.value - feeDue;
        if (minInitialBuyWei > 0 && initialBuyValue < minInitialBuyWei) revert InitialBuyTooLow();
        if (initialBuyValue > 0 && minInitialBuyTokens == 0) revert InvalidInput();
        if (feeDue > 0) _sendNative(payable(treasury), feeDue);

        token = Clones.clone(memeTokenImplementation);
        MemeTokenImplementation(token).initialize(name, symbol, msg.sender, address(bondingCurveManager), defaultTotalSupply);

        bondingCurveManager.registerToken(
            token,
            msg.sender,
            defaultTotalSupply,
            defaultVirtualEthReserve,
            defaultVirtualTokenReserve
        );

        creatorTokens[msg.sender].push(token);
        isLaunchpadToken[token] = true;

        emit TokenCreated(
            token,
            msg.sender,
            name,
            symbol,
            metadataURI,
            defaultTotalSupply,
            defaultVirtualEthReserve,
            block.timestamp
        );

        if (initialBuyValue > 0) {
            bondingCurveManager.buyFor{value: initialBuyValue}(token, msg.sender, minInitialBuyTokens);
        }
    }

    function setConfig(
        address treasury_,
        address bondingCurveManager_,
        uint256 createFee_,
        uint256 defaultTotalSupply_,
        uint256 defaultVirtualEthReserve_,
        uint256 defaultVirtualTokenReserve_
    ) external onlyOwner {
        if (treasury_ == address(0) || bondingCurveManager_ == address(0)) revert ZeroAddress();
        if (
            defaultTotalSupply_ == 0 ||
            defaultVirtualEthReserve_ == 0 ||
            defaultVirtualTokenReserve_ == 0 ||
            defaultVirtualTokenReserve_ != defaultTotalSupply_
        ) revert InvalidInput();

        treasury = treasury_;
        bondingCurveManager = IBondingCurveManager(bondingCurveManager_);
        createFee = createFee_;
        defaultTotalSupply = defaultTotalSupply_;
        defaultVirtualEthReserve = defaultVirtualEthReserve_;
        defaultVirtualTokenReserve = defaultVirtualTokenReserve_;

        emit ConfigUpdated(treasury_, bondingCurveManager_, createFee_, defaultVirtualEthReserve_);
    }

    function creatorTokenCount(address creator) external view returns (uint256) {
        return creatorTokens[creator].length;
    }

    function _createFeeFor(address account) internal view returns (uint256) {
        if (account == owner() || feeExempt[account]) return 0;
        return createFee;
    }

    function _sendNative(address payable to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    uint256[41] private __gap;
}
