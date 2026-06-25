// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IMemeToken {
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address creator_,
        address initialHolder_,
        uint256 totalSupply_
    ) external;
}

interface IBondingCurveManager {
    function registerToken(
        address token,
        address creator,
        uint256 totalSupply,
        uint256 virtualEthReserve,
        uint256 virtualTokenReserve
    ) external;

    function buyFor(
        address token,
        address recipient,
        uint256 minTokenOut
    ) external payable returns (uint256 tokenOut);
}
