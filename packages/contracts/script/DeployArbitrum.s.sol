// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {FlashRouteExecutor} from "../src/FlashRouteExecutor.sol";
import {console2} from "forge-std/console2.sol";

contract DeployArbitrum is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("Deployer");
        console2.log(deployer);

        vm.startBroadcast(pk);
        _deploy(deployer);
        vm.stopBroadcast();
    }

    function _deploy(address deployer) internal {
        address[] memory bArr = new address[](1);
        bArr[0] = vm.envAddress("BAL_ADDR");
        address[] memory aArr = new address[](1);
        aArr[0] = vm.envAddress("AAVE_ARB_ADDR");
        address[] memory rArr = new address[](3);
        rArr[0] = vm.envAddress("U2_ARB_ADDR");
        rArr[1] = vm.envAddress("U3_ADDR");
        rArr[2] = vm.envAddress("CRV_ADDR");
        address[] memory tArr = new address[](5);
        tArr[0] = vm.envAddress("WETH_ARB_ADDR");
        tArr[1] = vm.envAddress("USDC_ARB_ADDR");
        tArr[2] = vm.envAddress("USDT_ARB_ADDR");
        tArr[3] = vm.envAddress("DAI_ARB_ADDR");
        tArr[4] = vm.envAddress("WBTC_ARB_ADDR");

        FlashRouteExecutor ex = new FlashRouteExecutor(
            deployer, deployer, deployer, bArr, aArr, rArr, tArr
        );
        console2.log("Deployed at");
        console2.log(address(ex));
    }
}
