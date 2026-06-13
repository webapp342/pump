// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BondingCurveManager} from "../src/BondingCurveManager.sol";
import {LaunchpadTreasury} from "../src/LaunchpadTreasury.sol";
import {MemeFactory} from "../src/MemeFactory.sol";
import {MemeTokenImplementation} from "../src/MemeTokenImplementation.sol";

contract LaunchpadUnitTest is Test {
    uint256 internal constant MAX_TARGET_ZUG = type(uint256).max;

    address internal owner = address(0xA11CE);
    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xB0B);
    address internal referrer = makeAddr("referrer");
    address internal treasuryOwner = address(0x7A);

    LaunchpadTreasury internal treasury;
    BondingCurveManager internal bonding;
    MemeFactory internal factory;

    function setUp() public {
        treasury = new LaunchpadTreasury(treasuryOwner);
        bonding = new BondingCurveManager(owner, address(treasury));
        factory = new MemeFactory(owner, address(treasury), address(bonding));

        vm.startPrank(owner);
        bonding.setFactory(address(factory));
        factory.setConfig(
            address(treasury),
            address(bonding),
            0,
            1_000_000 ether,
            MAX_TARGET_ZUG,
            10 ether,
            1_000_000 ether
        );
        vm.stopPrank();

        vm.deal(creator, 100 ether);
        vm.deal(trader, 100 ether);
        vm.deal(referrer, 1 ether);
    }

    function testSetReferrerFeeSplitAndClaim() public {
        vm.prank(creator);
        address token = factory.createMeme("Zug Ref", "ZREF", "ipfs://zug-ref", 0);

        vm.prank(trader);
        bonding.setReferrer(referrer);

        vm.prank(trader);
        bonding.buy{value: 1 ether}(token, 1);

        assertGt(bonding.pendingCreatorFees(creator), 0);
        assertGt(bonding.pendingReferrerFees(referrer), 0);
        assertTrue(bonding.hasTraded(trader));
        assertEq(bonding.traderReferrer(trader), referrer);

        uint256 referrerBalanceBefore = referrer.balance;
        vm.prank(referrer);
        uint256 claimed = bonding.claimReferrerFees();
        assertGt(claimed, 0);
        assertEq(referrer.balance, referrerBalanceBefore + claimed);
    }

    function testSetReferrerDuplicateRevert() public {
        vm.prank(trader);
        bonding.setReferrer(referrer);

        vm.prank(trader);
        vm.expectRevert(BondingCurveManager.ReferrerAlreadySet.selector);
        bonding.setReferrer(address(0xDEAD));
    }

    function testSetReferrerAfterTradeRevert() public {
        vm.prank(creator);
        address token = factory.createMeme("Late Ref", "LREF", "ipfs://late-ref", 0);

        vm.prank(trader);
        bonding.buy{value: 1 ether}(token, 1);

        vm.prank(trader);
        vm.expectRevert(BondingCurveManager.AlreadyTraded.selector);
        bonding.setReferrer(referrer);
    }

    function testSetReferrerSelfRevert() public {
        vm.prank(trader);
        vm.expectRevert(BondingCurveManager.SelfReferrer.selector);
        bonding.setReferrer(trader);
    }

    function testBuyWithReferrerBindsOnFirstTrade() public {
        vm.prank(creator);
        address token = factory.createMeme("One Tx Ref", "OTREF", "ipfs://one-tx-ref", 0);

        vm.prank(trader);
        bonding.buyWithReferrer{value: 1 ether}(token, 1, referrer);

        assertEq(bonding.traderReferrer(trader), referrer);
        assertGt(bonding.pendingReferrerFees(referrer), 0);
        assertTrue(bonding.hasTraded(trader));
    }

    function testBuyWithReferrerSkipsInvalidReferrer() public {
        vm.prank(creator);
        address token = factory.createMeme("Skip Ref", "SKREF", "ipfs://skip-ref", 0);

        vm.prank(trader);
        bonding.buyWithReferrer{value: 1 ether}(token, 1, trader);

        assertEq(bonding.traderReferrer(trader), address(0));
        assertEq(bonding.pendingReferrerFees(referrer), 0);
    }

    function testReferrerShareBpsConstraint() public {
        vm.startPrank(owner);
        vm.expectRevert(BondingCurveManager.InvalidConfig.selector);
        bonding.setReferrerShareBps(9_000);
        vm.stopPrank();
    }

    function testCreateMemeDeploysFullTokenAndRegistersCurve() public {
        vm.prank(creator);
        address token = factory.createMeme("Zug Dog", "ZDOG", "ipfs://zug-dog", 0);

        assertTrue(factory.isLaunchpadToken(token));
        assertEq(factory.creatorTokenCount(creator), 1);
        assertEq(MemeTokenImplementation(token).creator(), creator);
        assertEq(MemeTokenImplementation(token).balanceOf(address(bonding)), 1_000_000 ether);

        (address curveToken, address curveCreator,,,,,, bool paused) = bonding.curves(token);
        assertEq(curveToken, token);
        assertEq(curveCreator, creator);
        assertFalse(paused);
    }

    function testBuySellAndCreatorFeeClaim() public {
        vm.prank(creator);
        address token = factory.createMeme("Zug Cat", "ZCAT", "ipfs://zug-cat", 0);

        vm.prank(trader);
        uint256 bought = bonding.buy{value: 1 ether}(token, 1);
        assertGt(bought, 0);
        assertGt(bonding.pendingCreatorFees(creator), 0);

        vm.startPrank(trader);
        MemeTokenImplementation(token).approve(address(bonding), bought / 2);
        uint256 zugOut = bonding.sell(token, bought / 2, 1);
        vm.stopPrank();
        assertGt(zugOut, 0);

        uint256 creatorBalanceBefore = creator.balance;
        vm.prank(creator);
        uint256 claimed = bonding.claimCreatorFees();
        assertGt(claimed, 0);
        assertEq(creator.balance, creatorBalanceBefore + claimed);
    }

    function testLargeBuyDoesNotPauseCurve() public {
        vm.prank(creator);
        address token = factory.createMeme("Zug Bull", "ZBULL", "ipfs://zug-bull", 0);

        vm.prank(trader);
        bonding.buy{value: 11 ether}(token, 1);

        (,,,,,,, bool paused) = bonding.curves(token);
        assertFalse(paused);
    }

    function testFactoryRequiresInitialBuySlippage() public {
        vm.expectRevert(MemeFactory.InvalidInput.selector);
        vm.prank(creator);
        factory.createMeme{value: 1 ether}("No Slippage", "NOSLIP", "ipfs://noslip", 0);
    }

    function testOwnershipTransferLocksOldAdmin() public {
        address newOwner = address(0xFEED);

        vm.prank(owner);
        bonding.transferOwnership(newOwner);
        assertEq(bonding.owner(), newOwner);

        vm.prank(owner);
        vm.expectRevert(BondingCurveManager.NotOwner.selector);
        bonding.setProtocolFeeBps(50);

        vm.prank(newOwner);
        bonding.setProtocolFeeBps(50);
        assertEq(bonding.protocolFeeBps(), 50);

        vm.prank(owner);
        factory.transferOwnership(newOwner);
        assertEq(factory.owner(), newOwner);

        vm.prank(newOwner);
        factory.setConfig(
            address(treasury),
            address(bonding),
            0,
            1_000_000 ether,
            MAX_TARGET_ZUG,
            10 ether,
            1_000_000 ether
        );
    }
}
