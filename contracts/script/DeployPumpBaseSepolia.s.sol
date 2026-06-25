// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {BondingCurveManager} from "../src/BondingCurveManager.sol";
import {LaunchpadLens} from "../src/LaunchpadLens.sol";
import {LaunchpadTreasury} from "../src/LaunchpadTreasury.sol";
import {MemeFactory} from "../src/MemeFactory.sol";
import {UUPSDeploy} from "./UUPSDeploy.sol";

/// @notice Fresh UUPS deploy for Base Sepolia (chain 84532).
contract DeployPumpBaseSepolia is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 internal constant VIRTUAL_ETH_RESERVE = 5 ether;
    uint256 internal constant CREATE_FEE = 0.001 ether;

    string internal constant DEPLOY_FILE = "deployments/base-sepolia-launchpad.json";
    string internal constant ABI_VERSION = "pump-base-sepolia-uups-v1";

    struct Deployed {
        address owner;
        address deployer;
        address launchpadTreasury;
        address launchpadTreasuryImpl;
        address memeTokenImplementation;
        address bondingCurveManager;
        address bondingCurveManagerImpl;
        address memeFactory;
        address memeFactoryImpl;
        address launchpadLens;
        address launchpadLensImpl;
        uint256 deploymentBlock;
    }

    function run() external returns (Deployed memory d) {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Wrong chainId, expected Base Sepolia 84532");

        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("LAUNCHPAD_OWNER_ADDRESS");
        require(owner != address(0), "LAUNCHPAD_OWNER_ADDRESS is zero");

        d.owner = owner;
        d.deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);

        LaunchpadTreasury treasuryImpl = new LaunchpadTreasury();
        d.launchpadTreasuryImpl = address(treasuryImpl);
        d.launchpadTreasury = payable(
            address(
                new ERC1967Proxy(
                    address(treasuryImpl),
                    abi.encodeCall(LaunchpadTreasury.initialize, (owner))
                )
            )
        );

        d.memeTokenImplementation = UUPSDeploy.deployMemeTokenImplementation();

        BondingCurveManager bondingImpl = new BondingCurveManager();
        d.bondingCurveManagerImpl = address(bondingImpl);
        d.bondingCurveManager = address(
            new ERC1967Proxy(
                address(bondingImpl),
                abi.encodeCall(BondingCurveManager.initialize, (owner, d.launchpadTreasury))
            )
        );

        MemeFactory factoryImpl = new MemeFactory();
        d.memeFactoryImpl = address(factoryImpl);
        d.memeFactory = address(
            new ERC1967Proxy(
                address(factoryImpl),
                abi.encodeCall(
                    MemeFactory.initialize,
                    (owner, d.launchpadTreasury, d.bondingCurveManager, d.memeTokenImplementation)
                )
            )
        );

        LaunchpadLens lensImpl = new LaunchpadLens();
        d.launchpadLensImpl = address(lensImpl);
        d.launchpadLens = address(
            new ERC1967Proxy(
                address(lensImpl),
                abi.encodeCall(LaunchpadLens.initialize, (owner, d.bondingCurveManager))
            )
        );

        BondingCurveManager(d.bondingCurveManager).setFactory(d.memeFactory);

        MemeFactory factory = MemeFactory(d.memeFactory);
        factory.setConfig(
            d.launchpadTreasury,
            d.bondingCurveManager,
            CREATE_FEE,
            factory.defaultTotalSupply(),
            VIRTUAL_ETH_RESERVE,
            factory.defaultVirtualTokenReserve()
        );

        vm.stopBroadcast();

        d.deploymentBlock = block.number;
        _save(d);
        _printSummary(d);
    }

    function _save(Deployed memory d) internal {
        if (!vm.exists("deployments")) vm.createDir("deployments", true);

        string memory key = "pump";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeString(key, "rpcUrl", "https://sepolia.base.org");
        vm.serializeString(key, "abiVersion", ABI_VERSION);
        vm.serializeString(key, "proxyPattern", "UUPS");
        vm.serializeAddress(key, "owner", d.owner);
        vm.serializeAddress(key, "deployer", d.deployer);
        vm.serializeUint(key, "deploymentBlock", d.deploymentBlock);
        vm.serializeAddress(key, "launchpadTreasury", d.launchpadTreasury);
        vm.serializeAddress(key, "launchpadTreasuryImpl", d.launchpadTreasuryImpl);
        vm.serializeAddress(key, "memeTokenImplementation", d.memeTokenImplementation);
        vm.serializeAddress(key, "bondingCurveManager", d.bondingCurveManager);
        vm.serializeAddress(key, "bondingCurveManagerImpl", d.bondingCurveManagerImpl);
        vm.serializeAddress(key, "memeFactory", d.memeFactory);
        vm.serializeAddress(key, "memeFactoryImpl", d.memeFactoryImpl);
        vm.serializeAddress(key, "launchpadLensImpl", d.launchpadLensImpl);
        string memory out = vm.serializeAddress(key, "launchpadLens", d.launchpadLens);
        vm.writeJson(out, DEPLOY_FILE);
    }

    function _printSummary(Deployed memory d) internal view {
        console2.log("========================================");
        console2.log(" BASE SEPOLIA PUMP UUPS DEPLOY");
        console2.log(" chainId:", block.chainid);
        console2.log(" deployer:", d.deployer);
        console2.log(" owner:", d.owner);
        console2.log(" deploymentBlock:", d.deploymentBlock);
        console2.log("========================================");
        console2.log(" MemeFactory (proxy):", d.memeFactory);
        console2.log(" BondingCurveManager (proxy):", d.bondingCurveManager);
        console2.log(" LaunchpadLens (proxy):", d.launchpadLens);
        console2.log(" Treasury (proxy):", d.launchpadTreasury);
        console2.log(" MemeToken impl (clone):", d.memeTokenImplementation);
        console2.log(" Virtual ETH reserve:", VIRTUAL_ETH_RESERVE);
        console2.log(" Create fee:", CREATE_FEE);
        console2.log(" JSON:", DEPLOY_FILE);
        console2.log("========================================");
    }
}
