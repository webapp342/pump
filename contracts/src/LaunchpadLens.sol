// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {BondingCurveManager} from "./BondingCurveManager.sol";

/// @notice UUPS-upgradeable read helper for frontend/indexer.
contract LaunchpadLens is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    BondingCurveManager public bondingCurveManager;

    struct CurveView {
        address token;
        address creator;
        uint256 reserveEth;
        uint256 soldTokens;
        uint256 virtualEthReserve;
        uint256 virtualTokenReserve;
        bool paused;
        uint256 spotPriceWei;
    }

    event BondingCurveManagerUpdated(address indexed previousManager, address indexed newManager);

    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address bondingCurveManager_) external initializer {
        if (bondingCurveManager_ == address(0)) revert ZeroAddress();
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        bondingCurveManager = BondingCurveManager(bondingCurveManager_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setBondingCurveManager(address bondingCurveManager_) external onlyOwner {
        if (bondingCurveManager_ == address(0)) revert ZeroAddress();
        address previous = address(bondingCurveManager);
        bondingCurveManager = BondingCurveManager(bondingCurveManager_);
        emit BondingCurveManagerUpdated(previous, bondingCurveManager_);
    }

    function getCurve(address token) public view returns (CurveView memory view_) {
        (
            address curveToken,
            address creator,
            uint256 reserveEth,
            uint256 soldTokens,
            ,
            uint256 virtualEthReserve,
            uint256 virtualTokenReserve,
            bool paused
        ) = bondingCurveManager.curves(token);

        view_ = CurveView({
            token: curveToken,
            creator: creator,
            reserveEth: reserveEth,
            soldTokens: soldTokens,
            virtualEthReserve: virtualEthReserve,
            virtualTokenReserve: virtualTokenReserve,
            paused: paused,
            spotPriceWei: bondingCurveManager.spotPriceWei(token)
        });
    }

    function getCurves(address[] calldata tokens) external view returns (CurveView[] memory views) {
        views = new CurveView[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            views[i] = getCurve(tokens[i]);
        }
    }

    function quoteBuy(address token, uint256 ethIn) external view returns (uint256 tokenOut, uint256 feeEth) {
        return bondingCurveManager.quoteBuy(token, ethIn);
    }

    function quoteSell(address token, uint256 tokenIn) external view returns (uint256 ethOut, uint256 feeEth) {
        return bondingCurveManager.quoteSell(token, tokenIn);
    }

    uint256[45] private __gap;
}
