/**
 * Role assignment utilities for contract deployment
 */

export class RoleAssigner {
    private deployer: any;
    private explorerUrl: string;
    private ethers: any;

    constructor(deployer: any, explorerUrl: string, ethers: any) {
        this.deployer = deployer;
        this.explorerUrl = explorerUrl;
        this.ethers = ethers;
    }

    async configureTimelockRoles(timelockAddress: string, modelDAOAddress: string): Promise<boolean> {
        console.log('   🔧 Configuring TimelockController roles for ModelDAO...');

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);

            const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
            const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();
            const DEFAULT_ADMIN_ROLE = await timelockContract.DEFAULT_ADMIN_ROLE();

            const hasAdminRole = await timelockContract.hasRole(DEFAULT_ADMIN_ROLE, this.deployer.address);
            console.log(`   🔍 Deployer has DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);

            if (!hasAdminRole) {
                console.log(`   ⚠️ Deployer doesn't have DEFAULT_ADMIN_ROLE, skipping role configuration`);
                return false;
            }

            console.log(`   🔧 Granting PROPOSER_ROLE to ModelDAO (${modelDAOAddress})...`);
            const grantProposerTx = await timelockContract.grantRole(PROPOSER_ROLE, modelDAOAddress);
            await grantProposerTx.wait();
            console.log(`   ✅ Granted PROPOSER_ROLE to ModelDAO`);

            console.log(`   🔧 Granting EXECUTOR_ROLE to ModelDAO (${modelDAOAddress})...`);
            const grantExecutorTx = await timelockContract.grantRole(EXECUTOR_ROLE, modelDAOAddress);
            await grantExecutorTx.wait();
            console.log(`   ✅ Granted EXECUTOR_ROLE to ModelDAO`);

            const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, modelDAOAddress);
            const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, modelDAOAddress);
            console.log(`   ✅ ModelDAO has PROPOSER_ROLE: ${hasProposerRole}`);
            console.log(`   ✅ ModelDAO has EXECUTOR_ROLE: ${hasExecutorRole}`);

            const deployerHasProposer = await timelockContract.hasRole(PROPOSER_ROLE, this.deployer.address);
            const deployerHasExecutor = await timelockContract.hasRole(EXECUTOR_ROLE, this.deployer.address);
            console.log(`   ✅ Deployer has PROPOSER_ROLE: ${deployerHasProposer}`);
            console.log(`   ✅ Deployer has EXECUTOR_ROLE: ${deployerHasExecutor}`);

            return true;
        } catch (error: any) {
            console.error(`   ❌ Failed to configure TimelockController roles: ${error.message}`);
            return false;
        }
    }

    async grantExecutorRole(timelockAddress: string, targetAddress: string): Promise<boolean> {
        console.log(`   🔧 Granting EXECUTOR_ROLE to ${targetAddress}...`);

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);
            const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();

            const hasRole = await timelockContract.hasRole(EXECUTOR_ROLE, targetAddress);
            if (hasRole) {
                console.log(`   ✅ ${targetAddress} already has EXECUTOR_ROLE`);
                return true;
            }

            const grantTx = await timelockContract.grantRole(EXECUTOR_ROLE, targetAddress);
            await grantTx.wait();
            console.log(`   ✅ Granted EXECUTOR_ROLE to ${targetAddress}`);

            const newHasRole = await timelockContract.hasRole(EXECUTOR_ROLE, targetAddress);
            console.log(`   ✅ ${targetAddress} now has EXECUTOR_ROLE: ${newHasRole}`);

            return true;
        } catch (error: any) {
            console.error(`   ❌ Failed to grant EXECUTOR_ROLE to ${targetAddress}: ${error.message}`);
            return false;
        }
    }

    async grantProposerRole(timelockAddress: string, targetAddress: string): Promise<boolean> {
        console.log(`   🔧 Granting PROPOSER_ROLE to ${targetAddress}...`);

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);
            const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();

            const hasRole = await timelockContract.hasRole(PROPOSER_ROLE, targetAddress);
            if (hasRole) {
                console.log(`   ✅ ${targetAddress} already has PROPOSER_ROLE`);
                return true;
            }

            const grantTx = await timelockContract.grantRole(PROPOSER_ROLE, targetAddress);
            await grantTx.wait();
            console.log(`   ✅ Granted PROPOSER_ROLE to ${targetAddress}`);

            const newHasRole = await timelockContract.hasRole(PROPOSER_ROLE, targetAddress);
            console.log(`   ✅ ${targetAddress} now has PROPOSER_ROLE: ${newHasRole}`);

            return true;
        } catch (error: any) {
            console.error(`   ❌ Failed to grant PROPOSER_ROLE to ${targetAddress}: ${error.message}`);
            return false;
        }
    }

    async fundContract(contractAddress: string, contractName: string, fundingAmount: string = '100.0'): Promise<boolean> {
        console.log(`   💰 Funding ${contractName} contract...`);

        try {
            const amount = this.ethers.parseEther(fundingAmount);
            console.log(`   🔗 Sending ${this.ethers.formatEther(amount)} ETH to ${contractName}...`);

            const fundTx = await this.deployer.sendTransaction({
                to: contractAddress,
                value: amount
            });

            console.log(`   ⏳ Waiting for funding transaction...`);
            const fundReceipt = await fundTx.wait();

            if (fundReceipt.status === 1) {
                console.log(`   ✅ Successfully funded ${contractName} with ${fundingAmount} ETH`);
                console.log(`   🔗 Transaction: ${fundReceipt.hash}`);
                if (this.explorerUrl) {
                    console.log(`   🔗 Explorer: ${this.explorerUrl}/tx/${fundReceipt.hash}`);
                }

                const contractBalance = await this.deployer.provider.getBalance(contractAddress);
                console.log(`   💰 ${contractName} balance: ${this.ethers.formatEther(contractBalance)} ETH`);

                return true;
            } else {
                console.warn(`   ⚠️ Funding transaction failed`);
                return false;
            }
        } catch (error: any) {
            console.error(`   ❌ Failed to fund ${contractName}: ${error.message}`);
            return false;
        }
    }
}

