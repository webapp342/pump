// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {MemeFactory} from "../src/MemeFactory.sol";

/// @notice After UUPS upgrade, set factory defaults to 5 ETH virtual reserve for new tokens.
contract SetFactoryVirtualEthReserve is Script {
    uint256 internal constant VIRTUAL_ETH_RESERVE = 5 ether;

    function run() external {
        address factoryAddress = vm.envAddress("MEME_FACTORY_ADDRESS");
        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        MemeFactory factory = MemeFactory(factoryAddress);

        vm.startBroadcast(privateKey);
        factory.setConfig(
            factory.treasury(),
            address(factory.bondingCurveManager()),
            factory.createFee(),
            factory.defaultTotalSupply(),
            VIRTUAL_ETH_RESERVE,
            factory.defaultVirtualTokenReserve()
        );
        vm.stopBroadcast();

        console2.log("defaultVirtualEthReserve:", factory.defaultVirtualEthReserve());
    }
}
