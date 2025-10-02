// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract Counter {
    uint public x;
    address timeLock;

    event Increment(uint by);

    modifier onlyTimelock() {
        require(msg.sender == timeLock, "Counter: caller is not timelock");
        _;
    }

    constructor(address _timeLock) {
        timeLock = _timeLock;
    }

    function inc() public onlyTimelock {
        x++;
        emit Increment(1);
    }

    function incBy(uint by) public onlyTimelock {
        require(by > 0, "incBy: increment should be positive");
        x += by;
        emit Increment(by);
    }
}
