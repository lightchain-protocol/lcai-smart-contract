//SPDX-License-Identifier: MIT
/*
  _     _       _     _       _           _            _    ___ 
 | |   (_) __ _| |__ | |_ ___| |__   __ _(_)_ __      / \  |_ _|
 | |   | |/ _` | '_ \| __/ __| '_ \ / _` | | '_ \    / _ \  | | 
 | |___| | (_| | | | | || (__| | | | (_| | | | | |  / ___ \ | | 
 |_____|_|\__, |_| |_|\__\___|_| |_|\__,_|_|_| |_| /_/   \_\___|
          |___/                                                 
*/

pragma solidity ^0.8.18;

import "@openzeppelin/contracts/governance/TimelockController.sol";

contract LCAITimeLock is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
