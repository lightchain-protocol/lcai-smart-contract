// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/NodeOnboarding.sol";
import "../contracts/NodeStaking.sol";
import "../contracts/mocks/MockAttestationVerifier.sol";

contract NodeOnboardingTest is Test {
    NodeOnboarding public nodeOnboarding;
    NodeStaking public nodeStaking;
    MockAttestationVerifier public attestationVerifier;
    address public validator1;
    address public worker1;
    address public owner;

    uint256 public constant MIN_VALIDATOR_STAKE = 32 ether;
    uint256 public constant MIN_WORKER_STAKE = 1 ether;
    uint256 public constant UNBONDING_PERIOD = 7 days;
    uint256 public constant MIN_TCB_STATUS = 1;
    uint256 public constant HEARTBEAT_TIMEOUT = 300;

    function setUp() public {
        owner = address(this);
        validator1 = makeAddr("validator1");
        worker1 = makeAddr("worker1");
        
        vm.deal(validator1, 100 ether);
        vm.deal(worker1, 100 ether);

        nodeStaking = new NodeStaking();
        nodeOnboarding = new NodeOnboarding(
            address(nodeStaking),
            MIN_VALIDATOR_STAKE,
            MIN_WORKER_STAKE,
            UNBONDING_PERIOD
        );
        nodeStaking.setNodeOnboarding(address(nodeOnboarding));

        attestationVerifier = new MockAttestationVerifier();
        nodeOnboarding.setAttestationVerifier(address(attestationVerifier));
        nodeOnboarding.setMinTcbStatus(MIN_TCB_STATUS);
        nodeOnboarding.setHeartbeatTimeout(HEARTBEAT_TIMEOUT);
        nodeOnboarding.setEnforceEnclaveAllowlist(true);
    }

    function test_RegisterValidator() public {
        bytes memory blsKey = new bytes(48);
        bytes memory pop = new bytes(96);
        bytes memory nodeKey = new bytes(33);
        bytes memory quote = "quote";
        bytes32 mrEnclave = bytes32("mr_enclave");

        nodeOnboarding.setMrEnclaveAllowed(mrEnclave, true);
        attestationVerifier.setResult(quote, mrEnclave, MIN_TCB_STATUS, true);

        vm.startPrank(validator1);
        nodeStaking.deposit{value: MIN_VALIDATOR_STAKE}();
        nodeOnboarding.registerValidator(blsKey, pop, nodeKey, quote);
        vm.stopPrank();

        INodeOnboarding.ValidatorInfo memory info = nodeOnboarding.getValidator(validator1);
        assertEq(keccak256(info.blsPublicKey), keccak256(blsKey));
        assertEq(info.attestationQuoteHash, keccak256(quote));
        assertEq(info.mrEnclave, mrEnclave);
        assertEq(info.tcbStatus, MIN_TCB_STATUS);
        assertTrue(info.isAttested);
        assertEq(uint8(nodeOnboarding.getNodeType(validator1)), uint8(INodeOnboarding.NodeType.Validator));

        assertTrue(nodeOnboarding.isValidatorActive(validator1));
    }

    function test_RegisterWorker() public {
        bytes memory quote = "worker_quote";
        bytes memory nodeKey = new bytes(33);
        string[] memory models = new string[](1);
        models[0] = "llama3";
        bytes32 mrEnclave = bytes32("mr_enclave");

        nodeOnboarding.setMrEnclaveAllowed(mrEnclave, true);
        attestationVerifier.setResult(quote, mrEnclave, MIN_TCB_STATUS, true);

        vm.startPrank(worker1);
        nodeStaking.deposit{value: MIN_WORKER_STAKE}();
        nodeOnboarding.registerWorker(nodeKey, quote, models);

        assertFalse(nodeOnboarding.isWorkerActive(worker1)); // Not verified yet
        
        vm.stopPrank();

        // Verify
        nodeOnboarding.verifyWorker(worker1, true);
        nodeOnboarding.setWorkerModelsReady(worker1, true);
        assertTrue(nodeOnboarding.isWorkerActive(worker1));
    }

    function test_RegisterValidatorInsufficientStake() public {
        vm.startPrank(validator1);
        
        bytes memory blsKey = new bytes(48);
        bytes memory pop = new bytes(96);
        bytes memory nodeKey = new bytes(33);
        bytes memory quote = "quote";

        vm.expectRevert("Insufficient stake");
        nodeOnboarding.registerValidator(blsKey, pop, nodeKey, quote);
        vm.stopPrank();
    }

    function test_ExitAndWithdraw() public {
        bytes memory blsKey = new bytes(48);
        bytes memory pop = new bytes(96);
        bytes memory nodeKey = new bytes(33);
        bytes memory quote = "quote";
        bytes32 mrEnclave = bytes32("mr_enclave");

        nodeOnboarding.setMrEnclaveAllowed(mrEnclave, true);
        attestationVerifier.setResult(quote, mrEnclave, MIN_TCB_STATUS, true);

        vm.startPrank(validator1);
        nodeStaking.deposit{value: MIN_VALIDATOR_STAKE}();
        nodeOnboarding.registerValidator(blsKey, pop, nodeKey, quote);
        vm.stopPrank();

        assertTrue(nodeOnboarding.isValidatorActive(validator1));

        vm.startPrank(validator1);
        nodeOnboarding.initiateExit();
        assertFalse(nodeOnboarding.isValidatorActive(validator1));
        
        // Fast forward
        vm.warp(block.timestamp + UNBONDING_PERIOD + 1);
        
        uint256 balanceBefore = validator1.balance;
        nodeStaking.withdraw(MIN_VALIDATOR_STAKE);
        uint256 balanceAfter = validator1.balance;
        
        assertEq(balanceAfter - balanceBefore, MIN_VALIDATOR_STAKE);
        nodeOnboarding.finalizeExit();
        assertEq(uint8(nodeOnboarding.getNodeType(validator1)), uint8(INodeOnboarding.NodeType.None));
        
        vm.stopPrank();
    }
}
