// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {PumpAirdropManager} from "../src/PumpAirdropManager.sol";

/// @notice UUPS deploy for PumpAirdropManager on Base Sepolia (requires pump deploy json).
contract DeployAirdropBaseSepolia is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 internal constant CREATE_FEE = 0.001 ether;

    string internal constant PUMP_DEPLOY_FILE = "deployments/base-sepolia-launchpad.json";
    string internal constant AIRDROP_DEPLOY_FILE = "deployments/base-sepolia-airdrop.json";
    string internal constant ABI_VERSION = "pump-airdrop-base-sepolia-v1";

    struct Deployed {
        address owner;
        address deployer;
        address keeper;
        address launchpadTreasury;
        address memeFactory;
        address pumpAirdropManager;
        address pumpAirdropManagerImpl;
        uint256 deploymentBlock;
    }

    function run() external returns (Deployed memory d) {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Wrong chainId, expected Base Sepolia 84532");
        require(vm.exists(PUMP_DEPLOY_FILE), "Missing base-sepolia-launchpad.json - deploy pump first");

        string memory pumpJson = vm.readFile(PUMP_DEPLOY_FILE);
        d.launchpadTreasury = vm.parseJsonAddress(pumpJson, ".launchpadTreasury");
        d.memeFactory = vm.parseJsonAddress(pumpJson, ".memeFactory");

        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        d.owner = vm.envAddress("LAUNCHPAD_OWNER_ADDRESS");
        d.deployer = vm.addr(privateKey);
        d.keeper = vm.envOr("AIRDROP_KEEPER_ADDRESS", d.deployer);

        require(d.owner != address(0), "LAUNCHPAD_OWNER_ADDRESS is zero");
        require(d.launchpadTreasury != address(0), "launchpadTreasury missing in pump deploy json");
        require(d.memeFactory != address(0), "memeFactory missing in pump deploy json");

        vm.startBroadcast(privateKey);

        PumpAirdropManager impl = new PumpAirdropManager();
        d.pumpAirdropManagerImpl = address(impl);
        d.pumpAirdropManager = address(
            new ERC1967Proxy(
                address(impl),
                abi.encodeCall(PumpAirdropManager.initialize, (d.owner, d.launchpadTreasury, d.memeFactory, d.keeper, CREATE_FEE))
            )
        );

        vm.stopBroadcast();

        d.deploymentBlock = block.number;
        _save(d);
        _printSummary(d);
    }

    function _save(Deployed memory d) internal {
        if (!vm.exists("deployments")) vm.createDir("deployments", true);

        string memory key = "airdrop";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeString(key, "rpcUrl", "https://sepolia.base.org");
        vm.serializeString(key, "abiVersion", ABI_VERSION);
        vm.serializeString(key, "proxyPattern", "UUPS");
        vm.serializeAddress(key, "owner", d.owner);
        vm.serializeAddress(key, "deployer", d.deployer);
        vm.serializeAddress(key, "keeper", d.keeper);
        vm.serializeUint(key, "deploymentBlock", d.deploymentBlock);
        vm.serializeAddress(key, "launchpadTreasury", d.launchpadTreasury);
        vm.serializeAddress(key, "memeFactory", d.memeFactory);
        vm.serializeAddress(key, "pumpAirdropManagerImpl", d.pumpAirdropManagerImpl);
        string memory out = vm.serializeAddress(key, "pumpAirdropManager", d.pumpAirdropManager);
        vm.writeJson(out, AIRDROP_DEPLOY_FILE);
    }

    function _printSummary(Deployed memory d) internal view {
        console2.log("========================================");
        console2.log(" BASE SEPOLIA AIRDROP UUPS DEPLOY");
        console2.log(" chainId:", block.chainid);
        console2.log(" deployer:", d.deployer);
        console2.log(" owner/admin:", d.owner);
        console2.log(" keeper:", d.keeper);
        console2.log(" deploymentBlock:", d.deploymentBlock);
        console2.log("========================================");
        console2.log(" PumpAirdropManager (proxy):", d.pumpAirdropManager);
        console2.log(" JSON:", AIRDROP_DEPLOY_FILE);
        console2.log("========================================");
    }
}
