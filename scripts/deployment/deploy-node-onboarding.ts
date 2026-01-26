import { network } from "hardhat";

import { saveAbi } from "../abi/saveAbi.js";

const DEFAULTS = {
    minValidatorStakeEth: "32",
    minWorkerStakeEth: "1",
    unbondingPeriodSeconds: 7 * 24 * 60 * 60,
    enforceEnclaveAllowlist: true,
    minTcbStatus: 1,
    heartbeatTimeoutSeconds: 300
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
    return fallback;
};

async function main() {
    const { ethers } = await network.connect();
    const [deployer] = await ethers.getSigners();

    const minValidatorStakeEth = process.env.MIN_VALIDATOR_STAKE_ETH || DEFAULTS.minValidatorStakeEth;
    const minWorkerStakeEth = process.env.MIN_WORKER_STAKE_ETH || DEFAULTS.minWorkerStakeEth;
    const unbondingPeriodSeconds = BigInt(
        process.env.UNBONDING_PERIOD_SECONDS || DEFAULTS.unbondingPeriodSeconds.toString()
    );

    const enforceEnclaveAllowlist = parseBoolean(
        process.env.ENFORCE_ENCLAVE_ALLOWLIST,
        DEFAULTS.enforceEnclaveAllowlist
    );
    const minTcbStatus = BigInt(process.env.MIN_TCB_STATUS || DEFAULTS.minTcbStatus.toString());
    const heartbeatTimeoutSeconds = BigInt(
        process.env.HEARTBEAT_TIMEOUT_SECONDS || DEFAULTS.heartbeatTimeoutSeconds.toString()
    );

    console.log("\n🔐 Deploying NodeStaking + NodeOnboarding");
    console.log("======================================");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Min validator stake: ${minValidatorStakeEth} ETH`);
    console.log(`Min worker stake: ${minWorkerStakeEth} ETH`);
    console.log(`Unbonding period: ${unbondingPeriodSeconds.toString()} seconds`);
    console.log(`Enforce MR_ENCLAVE allowlist: ${enforceEnclaveAllowlist}`);
    console.log(`Min TCB status: ${minTcbStatus.toString()}`);
    console.log(`Heartbeat timeout: ${heartbeatTimeoutSeconds.toString()} seconds`);

    const NodeStaking = await ethers.getContractFactory("NodeStaking", deployer);
    const nodeStaking = await NodeStaking.deploy();
    await nodeStaking.waitForDeployment();
    const nodeStakingAddress = await nodeStaking.getAddress();
    console.log(`✅ NodeStaking deployed at: ${nodeStakingAddress}`);

    const NodeOnboarding = await ethers.getContractFactory("NodeOnboarding", deployer);
    const nodeOnboarding = await NodeOnboarding.deploy(
        nodeStakingAddress,
        ethers.parseEther(minValidatorStakeEth),
        ethers.parseEther(minWorkerStakeEth),
        unbondingPeriodSeconds
    );
    await nodeOnboarding.waitForDeployment();
    const nodeOnboardingAddress = await nodeOnboarding.getAddress();
    console.log(`✅ NodeOnboarding deployed at: ${nodeOnboardingAddress}`);

    await nodeStaking.setNodeOnboarding(nodeOnboardingAddress);
    console.log("🔗 Linked NodeStaking to NodeOnboarding");

    const verifierAddress = (process.env.ATTESTATION_VERIFIER_ADDRESS || "").trim();
    if (verifierAddress !== "") {
        await nodeOnboarding.setAttestationVerifier(verifierAddress);
        console.log(`🔍 Attestation verifier set to: ${verifierAddress}`);
    } else {
        console.log("⚠️  ATTESTATION_VERIFIER_ADDRESS not set; attestation checks disabled");
    }

    await nodeOnboarding.setEnforceEnclaveAllowlist(enforceEnclaveAllowlist);
    await nodeOnboarding.setMinTcbStatus(minTcbStatus);
    await nodeOnboarding.setHeartbeatTimeout(heartbeatTimeoutSeconds);
    console.log("⚙️  Policy defaults applied");

    const allowlistRaw = process.env.MR_ENCLAVE_ALLOWLIST || "";
    const allowlist = allowlistRaw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");

    for (const mrEnclave of allowlist) {
        await nodeOnboarding.setMrEnclaveAllowed(mrEnclave, true);
        console.log(`✅ MR_ENCLAVE allowed: ${mrEnclave}`);
    }

    if (enforceEnclaveAllowlist && allowlist.length === 0) {
        console.log("⚠️  MR_ENCLAVE allowlist enforcement enabled with no entries configured");
    }

    try {
        saveAbi("NodeStaking", NodeStaking);
        saveAbi("NodeOnboarding", NodeOnboarding);
        console.log("📄 ABIs saved for NodeStaking and NodeOnboarding");
    } catch (error: any) {
        console.warn("⚠️  Failed to save ABIs:", error.message);
    }

    console.log("\n✅ Node onboarding deployment complete\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
