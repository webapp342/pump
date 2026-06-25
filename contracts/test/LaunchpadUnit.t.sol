// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BondingCurveManager} from "../src/BondingCurveManager.sol";
import {LaunchpadTreasury} from "../src/LaunchpadTreasury.sol";
import {MemeFactory} from "../src/MemeFactory.sol";
import {MemeTokenImplementation} from "../src/MemeTokenImplementation.sol";
import {UUPSDeploy} from "../script/UUPSDeploy.sol";

contract LaunchpadUnitTest is Test {
    uint256 internal constant VIRTUAL_ETH_RESERVE = 5 ether;

    address internal owner = address(0xA11CE);
    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xB0B);
    address internal referrer = makeAddr("referrer");
    address internal treasuryOwner = address(0x7A);

    LaunchpadTreasury internal treasury;
    BondingCurveManager internal bonding;
    MemeFactory internal factory;
    address internal memeTokenImplementation;

    function setUp() public {
        treasury = UUPSDeploy.deployTreasury(treasuryOwner);
        bonding = UUPSDeploy.deployBondingCurve(owner, address(treasury));
        memeTokenImplementation = UUPSDeploy.deployMemeTokenImplementation();
        factory = UUPSDeploy.deployMemeFactory(owner, address(treasury), address(bonding), memeTokenImplementation);

        vm.startPrank(owner);
        bonding.setFactory(address(factory));
        factory.setConfig(
            address(treasury),
            address(bonding),
            0,
            1_000_000_000 ether,
            VIRTUAL_ETH_RESERVE,
            1_000_000_000 ether
        );
        vm.stopPrank();

        vm.deal(creator, 100 ether);
        vm.deal(trader, 100 ether);
        vm.deal(referrer, 1 ether);
    }

    function testOwnerCreatesMemeWithoutFee() public {
        vm.deal(owner, 10 ether);
        uint256 ownerBefore = owner.balance;

        vm.prank(owner);
        address token = factory.createMeme("Admin Meme", "ADM", "ipfs://admin", 0);

        assertTrue(token != address(0));
        assertEq(owner.balance, ownerBefore);
    }

    function testMinInitialBuyEnforced() public {
        vm.prank(owner);
        factory.setConfig(
            address(treasury),
            address(bonding),
            0.01 ether,
            1_000_000_000 ether,
            VIRTUAL_ETH_RESERVE,
            1_000_000_000 ether
        );
        vm.prank(owner);
        factory.setMinInitialBuyWei(0.05 ether);

        vm.prank(creator);
        vm.expectRevert(MemeFactory.InitialBuyTooLow.selector);
        factory.createMeme{value: 0.01 ether}("Low Buy", "LOW", "ipfs://low", 1);

        vm.prank(creator);
        address token = factory.createMeme{value: 0.06 ether}("Ok Buy", "OK", "ipfs://ok", 1);
        assertTrue(token != address(0));
    }

    function testFeeExemptCreatorSkipsCreateFee() public {
        vm.prank(owner);
        factory.setConfig(
            address(treasury),
            address(bonding),
            0.01 ether,
            1_000_000_000 ether,
            VIRTUAL_ETH_RESERVE,
            1_000_000_000 ether
        );
        vm.prank(owner);
        factory.setFeeExempt(creator, true);

        uint256 creatorBefore = creator.balance;
        vm.prank(creator);
        factory.createMeme{value: 0.05 ether}("Exempt", "EXM", "ipfs://exempt", 1);

        assertEq(creator.balance, creatorBefore - 0.05 ether);
    }

    function testSetReferrerFeeSplitAndClaim() public {
        vm.prank(creator);
        address token = factory.createMeme("Eth Ref", "EREF", "ipfs://eth-ref", 0);

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
        address token = factory.createMeme("Eth Dog", "EDOG", "ipfs://eth-dog", 0);

        assertTrue(factory.isLaunchpadToken(token));
        assertEq(factory.creatorTokenCount(creator), 1);
        assertEq(MemeTokenImplementation(token).creator(), creator);
        assertEq(MemeTokenImplementation(token).balanceOf(address(bonding)), 1_000_000_000 ether);

        (address curveToken, address curveCreator,,,, uint256 virtualEthReserve,, bool paused) = bonding.curves(token);
        assertEq(curveToken, token);
        assertEq(curveCreator, creator);
        assertEq(virtualEthReserve, VIRTUAL_ETH_RESERVE);
        assertFalse(paused);
    }

    function testSpotPriceWeiMatchesReserves() public {
        vm.prank(creator);
        address token = factory.createMeme("Spot", "SPT", "ipfs://spot", 0);

        uint256 spotBefore = bonding.spotPriceWei(token);
        assertEq(spotBefore, (VIRTUAL_ETH_RESERVE * 1e18) / (1_000_000_000 ether));

        vm.prank(trader);
        bonding.buy{value: 1 ether}(token, 1);

        uint256 spotAfter = bonding.spotPriceWei(token);
        assertGt(spotAfter, spotBefore);
    }

    function testSellWithPermitWithoutPriorApprove() public {
        uint256 traderKey = 0xB0B1;
        address permitTrader = vm.addr(traderKey);
        vm.deal(permitTrader, 100 ether);

        vm.prank(creator);
        address token = factory.createMeme("Permit", "PRM", "ipfs://permit", 0);

        vm.prank(permitTrader);
        uint256 bought = bonding.buy{value: 1 ether}(token, 1);

        uint256 sellAmount = bought / 2;
        uint256 permitValue = type(uint256).max;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = MemeTokenImplementation(token).nonces(permitTrader);

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                permitTrader,
                address(bonding),
                permitValue,
                nonce,
                deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", MemeTokenImplementation(token).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(traderKey, digest);

        assertEq(MemeTokenImplementation(token).allowance(permitTrader, address(bonding)), 0);

        vm.prank(permitTrader);
        uint256 ethOut = bonding.sellWithPermit(token, sellAmount, 1, deadline, v, r, s);
        assertGt(ethOut, 0);
        assertEq(MemeTokenImplementation(token).allowance(permitTrader, address(bonding)), type(uint256).max);

        vm.prank(permitTrader);
        uint256 ethOut2 = bonding.sell(token, bought / 4, 1);
        assertGt(ethOut2, 0);
    }

    function testSellBatch() public {
        vm.prank(creator);
        address tokenA = factory.createMeme("Batch A", "BATA", "ipfs://batch-a", 0);

        vm.prank(creator);
        address tokenB = factory.createMeme("Batch B", "BATB", "ipfs://batch-b", 0);

        vm.startPrank(trader);
        uint256 boughtA = bonding.buy{value: 1 ether}(tokenA, 1);
        uint256 boughtB = bonding.buy{value: 1 ether}(tokenB, 1);

        MemeTokenImplementation(tokenA).approve(address(bonding), boughtA);
        MemeTokenImplementation(tokenB).approve(address(bonding), boughtB);

        BondingCurveManager.SellInput[] memory sells = new BondingCurveManager.SellInput[](2);
        sells[0] = BondingCurveManager.SellInput({token: tokenA, tokenIn: boughtA / 2, minEthOut: 1});
        sells[1] = BondingCurveManager.SellInput({token: tokenB, tokenIn: boughtB / 2, minEthOut: 1});

        uint256[] memory outs = bonding.sellBatch(sells);
        vm.stopPrank();

        assertGt(outs[0], 0);
        assertGt(outs[1], 0);
    }

    function testBuySellAndCreatorFeeClaim() public {
        vm.prank(creator);
        address token = factory.createMeme("Eth Cat", "ECAT", "ipfs://eth-cat", 0);

        vm.prank(trader);
        uint256 bought = bonding.buy{value: 1 ether}(token, 1);
        assertGt(bought, 0);
        assertGt(bonding.pendingCreatorFees(creator), 0);

        vm.startPrank(trader);
        MemeTokenImplementation(token).approve(address(bonding), bought / 2);
        uint256 ethOut = bonding.sell(token, bought / 2, 1);
        vm.stopPrank();
        assertGt(ethOut, 0);

        uint256 creatorBalanceBefore = creator.balance;
        vm.prank(creator);
        uint256 claimed = bonding.claimCreatorFees();
        assertGt(claimed, 0);
        assertEq(creator.balance, creatorBalanceBefore + claimed);
    }

    function testLargeBuyDoesNotPauseCurve() public {
        vm.prank(creator);
        address token = factory.createMeme("Eth Bull", "EBULL", "ipfs://eth-bull", 0);

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

    function testEmergencySweepAllEthHaltsTrading() public {
        vm.prank(creator);
        address token = factory.createMeme("Sweep", "SWP", "ipfs://sweep", 0);

        vm.prank(trader);
        bonding.buy{value: 2 ether}(token, 1);

        address safe = makeAddr("safe");
        uint256 curveBalance = address(bonding).balance;
        assertGt(curveBalance, 0);

        vm.prank(owner);
        bonding.emergencySweepAllEth(safe);

        assertEq(address(bonding).balance, 0);
        assertEq(safe.balance, curveBalance);
        assertTrue(bonding.emergencyHalt());

        vm.prank(trader);
        vm.expectRevert(BondingCurveManager.EmergencyHalted.selector);
        bonding.buy{value: 0.1 ether}(token, 1);
    }

    function testEmergencySweepRevertsForNonOwner() public {
        vm.prank(trader);
        vm.expectRevert();
        bonding.emergencySweepAllEth(trader);
    }

    function testOwnershipTransferLocksOldAdmin() public {
        address newOwner = address(0xFEED);

        vm.prank(owner);
        bonding.transferOwnership(newOwner);
        assertEq(bonding.owner(), newOwner);

        vm.prank(owner);
        vm.expectRevert();
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
            1_000_000_000 ether,
            VIRTUAL_ETH_RESERVE,
            1_000_000_000 ether
        );
    }
}
