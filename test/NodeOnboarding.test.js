import { expect } from "chai";
import hre from "hardhat";

const { network } = hre;
let ethers;

describe("NodeStaking & NodeOnboarding AIVM Integration", function () {
    let nodeOnboarding, nodeStaking, attestationVerifier;
    let owner, validator1, worker1, otherAccount;
    let minValidatorStake, minWorkerStake, unbondingPeriod;
    let minTcbStatus, heartbeatTimeout, enforceEnclaveAllowlist;

    beforeEach(async function () {
        ({ ethers } = await network.connect());
        [owner, validator1, worker1, otherAccount] = await ethers.getSigners();

        minValidatorStake = ethers.parseEther("32");
        minWorkerStake = ethers.parseEther("1");
        unbondingPeriod = 60 * 60 * 24 * 7; // 7 days
        minTcbStatus = 1;
        heartbeatTimeout = 300;
        enforceEnclaveAllowlist = true;

        // Deploy Staking
        const NodeStaking = await ethers.getContractFactory("NodeStaking");
        nodeStaking = await NodeStaking.deploy();

        // Deploy Attestation Verifier
        const MockAttestationVerifier = await ethers.getContractFactory("MockAttestationVerifier");
        attestationVerifier = await MockAttestationVerifier.deploy();

        // Deploy Onboarding
        const NodeOnboarding = await ethers.getContractFactory("NodeOnboarding");
        nodeOnboarding = await NodeOnboarding.deploy(
            await nodeStaking.getAddress(),
            minValidatorStake,
            minWorkerStake,
            unbondingPeriod
        );

        // Link Staking to Onboarding
        await nodeStaking.setNodeOnboarding(await nodeOnboarding.getAddress());

        await nodeOnboarding.setAttestationVerifier(await attestationVerifier.getAddress());
        await nodeOnboarding.setMinTcbStatus(minTcbStatus);
        await nodeOnboarding.setHeartbeatTimeout(heartbeatTimeout);
        await nodeOnboarding.setEnforceEnclaveAllowlist(enforceEnclaveAllowlist);
    });

    describe("AIVM Lifecycle", function () {
        it("Should register a worker with attestation metadata", async function () {
            const quote = ethers.hexlify(ethers.randomBytes(100));
            const nodePublicKey = ethers.hexlify(ethers.randomBytes(33));
            const mrEnclave = ethers.hexlify(ethers.randomBytes(32));
            const models = ["llama3-8b"];
            const quoteHash = ethers.keccak256(quote);
            const modelsRoot = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(["string[]"], [models])
            );

            await nodeOnboarding.setMrEnclaveAllowed(mrEnclave, true);
            await attestationVerifier.setResult(quote, mrEnclave, minTcbStatus, true);

            // Stake
            await nodeStaking.connect(worker1).deposit({ value: minWorkerStake });

            // Register
            await expect(
                nodeOnboarding.connect(worker1).registerWorker(nodePublicKey, quote, models)
            )
                .to.emit(nodeOnboarding, "WorkerJoined")
                .withArgs(worker1.address, nodePublicKey, quoteHash, modelsRoot);

            const workerInfo = await nodeOnboarding.getWorker(worker1.address);
            expect(workerInfo.attestationQuoteHash).to.equal(quoteHash);
            expect(workerInfo.modelsRoot).to.equal(modelsRoot);
            expect(workerInfo.mrEnclave).to.equal(mrEnclave);
            expect(workerInfo.tcbStatus).to.equal(minTcbStatus);
            expect(workerInfo.isAttested).to.equal(true);

            await nodeOnboarding.verifyWorker(worker1.address, true);
            await nodeOnboarding.setWorkerModelsReady(worker1.address, true);

            expect(await nodeOnboarding.isWorkerActive(worker1.address)).to.equal(true);
        });

        it("Should update heartbeat", async function () {
            const blsKey = ethers.hexlify(ethers.randomBytes(48));
            const pop = ethers.hexlify(ethers.randomBytes(96));
            const nodePublicKey = ethers.hexlify(ethers.randomBytes(33));
            const quote = ethers.hexlify(ethers.randomBytes(100));
            const mrEnclave = ethers.hexlify(ethers.randomBytes(32));

            // Register Validator
            await nodeOnboarding.setMrEnclaveAllowed(mrEnclave, true);
            await attestationVerifier.setResult(quote, mrEnclave, minTcbStatus, true);
            await nodeStaking.connect(validator1).deposit({ value: minValidatorStake });
            await nodeOnboarding.connect(validator1).registerValidator(blsKey, pop, nodePublicKey, quote);

            // Heartbeat
            await expect(nodeOnboarding.connect(validator1).heartbeat())
                .to.emit(nodeOnboarding, "Heartbeat");

            const validatorInfo = await nodeOnboarding.getValidator(validator1.address);
            expect(validatorInfo.lastHeartbeat).to.be.closeTo(Math.floor(Date.now() / 1000), 100);
            expect(validatorInfo.isAttested).to.equal(true);
        });
    });

    describe("Attestation policy", function () {
        it("Should reject when MR_ENCLAVE is not allowlisted", async function () {
            const quote = ethers.hexlify(ethers.randomBytes(100));
            const nodePublicKey = ethers.hexlify(ethers.randomBytes(33));
            const mrEnclave = ethers.hexlify(ethers.randomBytes(32));
            const models = ["llama3-8b"];

            await attestationVerifier.setResult(quote, mrEnclave, minTcbStatus, true);
            await nodeStaking.connect(worker1).deposit({ value: minWorkerStake });

            await expect(
                nodeOnboarding.connect(worker1).registerWorker(nodePublicKey, quote, models)
            ).to.be.revertedWith("MR_ENCLAVE not allowed");
        });

        it("Should reject when TCB status is too low", async function () {
            const requiredTcbStatus = 2;
            const quote = ethers.hexlify(ethers.randomBytes(100));
            const nodePublicKey = ethers.hexlify(ethers.randomBytes(33));
            const mrEnclave = ethers.hexlify(ethers.randomBytes(32));
            const models = ["llama3-8b"];

            await nodeOnboarding.setMinTcbStatus(requiredTcbStatus);
            await nodeOnboarding.setMrEnclaveAllowed(mrEnclave, true);
            await attestationVerifier.setResult(quote, mrEnclave, requiredTcbStatus - 1, true);
            await nodeStaking.connect(worker1).deposit({ value: minWorkerStake });

            await expect(
                nodeOnboarding.connect(worker1).registerWorker(nodePublicKey, quote, models)
            ).to.be.revertedWith("TCB status too low");
        });
    });
});
