// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {MemeFactory} from "../src/MemeFactory.sol";

/// @notice Sets MemeFactory.createFee while keeping all other config unchanged.
/// @dev Signer must be MemeFactory owner (LAUNCHPAD_OWNER_ADDRESS at deploy time).
contract SetMemeFactoryCreateFee is Script {
    uint256 internal constant ZUGCHAIN_ID = 824642;
    uint256 internal constant CREATE_FEE = 5 ether;

    function run() external {
        require(block.chainid == ZUGCHAIN_ID, "Wrong chainId, expected 824642");

        address factoryAddress = vm.envAddress("MEME_FACTORY_ADDRESS");
        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        MemeFactory factory = MemeFactory(factoryAddress);

        address treasury = factory.treasury();
        address bondingCurveManager = address(factory.bondingCurveManager());
        uint256 defaultTotalSupply = factory.defaultTotalSupply();
        uint256 defaultVirtualEthReserve = factory.defaultVirtualEthReserve();
        uint256 defaultVirtualTokenReserve = factory.defaultVirtualTokenReserve();
        uint256 currentFee = factory.createFee();

        console2.log("MemeFactory:", factoryAddress);
        console2.log("Owner:", factory.owner());
        console2.log("Signer:", vm.addr(privateKey));
        console2.log("Current createFee (wei):", currentFee);
        console2.log("New createFee (wei):", CREATE_FEE);

        vm.startBroadcast(privateKey);

        factory.setConfig(
            treasury,
            bondingCurveManager,
            CREATE_FEE,
            defaultTotalSupply,
            defaultVirtualEthReserve,
            defaultVirtualTokenReserve
        );

        vm.stopBroadcast();

        console2.log("Done. createFee is now:", factory.createFee());
    }
}
