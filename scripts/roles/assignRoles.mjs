/**
 * Role assignment utilities for contract deployment
 */

export class RoleAssigner {
    constructor(deployer, explorerUrl, ethers) {
        this.deployer = deployer;
        this.explorerUrl = explorerUrl;
        this.ethers = ethers;
    }

    /**
     * Configure TimelockController roles for ModelDAO
     * @param {string} timelockAddress - TimelockController contract address
     * @param {string} modelDAOAddress - ModelDAO contract address
     */
    async configureTimelockRoles(timelockAddress, modelDAOAddress) {
        console.log('   🔧 Configuring TimelockController roles for ModelDAO...');

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);

            const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
            const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();
            const DEFAULT_ADMIN_ROLE = await timelockContract.DEFAULT_ADMIN_ROLE();

            // Check if deployer has admin role
            const hasAdminRole = await timelockContract.hasRole(DEFAULT_ADMIN_ROLE, this.deployer.address);
            console.log(`   🔍 Deployer has DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);

            if (!hasAdminRole) {
                console.log(`   ⚠️ Deployer doesn't have DEFAULT_ADMIN_ROLE, skipping role configuration`);
                return false;
            }

            // Grant roles to ModelDAO
            console.log(`   🔧 Granting PROPOSER_ROLE to ModelDAO (${modelDAOAddress})...`);
            const grantProposerTx = await timelockContract.grantRole(PROPOSER_ROLE, modelDAOAddress);
            await grantProposerTx.wait();
            console.log(`   ✅ Granted PROPOSER_ROLE to ModelDAO`);

            console.log(`   🔧 Granting EXECUTOR_ROLE to ModelDAO (${modelDAOAddress})...`);
            const grantExecutorTx = await timelockContract.grantRole(EXECUTOR_ROLE, modelDAOAddress);
            await grantExecutorTx.wait();
            console.log(`   ✅ Granted EXECUTOR_ROLE to ModelDAO`);

            // Verify roles were granted
            const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, modelDAOAddress);
            const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, modelDAOAddress);
            console.log(`   ✅ ModelDAO has PROPOSER_ROLE: ${hasProposerRole}`);
            console.log(`   ✅ ModelDAO has EXECUTOR_ROLE: ${hasExecutorRole}`);

            // Final verification
            const deployerHasProposer = await timelockContract.hasRole(PROPOSER_ROLE, this.deployer.address);
            const deployerHasExecutor = await timelockContract.hasRole(EXECUTOR_ROLE, this.deployer.address);
            console.log(`   ✅ Deployer has PROPOSER_ROLE: ${deployerHasProposer}`);
            console.log(`   ✅ Deployer has EXECUTOR_ROLE: ${deployerHasExecutor}`);

            return true;

        } catch (error) {
            console.error(`   ❌ Failed to configure TimelockController roles: ${error.message}`);
            console.error(`   Stack trace: ${error.stack}`);
            return false;
        }
    }

    /**
     * Update ModelDAORewardsFacet's modelDAO field and transfer ownership
     * @param {string} modelDAORewardsFacetAddress - ModelDAORewardsFacet contract address
     * @param {string} modelDAOAddress - ModelDAO contract address
     */
    async updateModelDAORewardsFacetConfiguration(modelDAORewardsFacetAddress, modelDAOAddress) {
        // Update ModelDAORewardsFacet's modelDAO field
        console.log('   🔧 Updating ModelDAORewardsFacet modelDAO field...');
        try {
            const modelDAORewardsFacetContract = await this.ethers.getContractAt('ModelDAORewardsFacet', modelDAORewardsFacetAddress, this.deployer);

            console.log(`   🔍 Current ModelDAORewardsFacet modelDAO: ${await modelDAORewardsFacetContract.modelDAO()}`);
            console.log(`   🔍 Updating modelDAO to new ModelDAO: ${modelDAOAddress}`);

            // Update the modelDAO field while deployer still owns ModelDAORewardsFacet
            const updateTx = await modelDAORewardsFacetContract.updateDAO(modelDAOAddress);
            await updateTx.wait();

            const newModelDAO = await modelDAORewardsFacetContract.modelDAO();
            console.log(`   ✅ ModelDAORewardsFacet modelDAO updated to: ${newModelDAO}`);

            if (newModelDAO === modelDAOAddress) {
                console.log(`   ✅ ModelDAORewardsFacet modelDAO successfully updated to ModelDAO`);
            } else {
                console.warn(`   ⚠️ ModelDAORewardsFacet modelDAO update may have failed`);
            }
        } catch (error) {
            console.error(`   ❌ Failed to update ModelDAORewardsFacet modelDAO: ${error.message}`);
            return false;
        }

        // Transfer ModelDAORewardsFacet ownership to ModelDAO
        console.log('   🔧 Transferring ModelDAORewardsFacet ownership to ModelDAO...');
        try {
            const modelDAORewardsFacetContract = await this.ethers.getContractAt('ModelDAORewardsFacet', modelDAORewardsFacetAddress, this.deployer);

            console.log(`   🔍 Current ModelDAORewardsFacet owner: ${await modelDAORewardsFacetContract.owner()}`);
            console.log(`   🔍 Transferring ownership to ModelDAO: ${modelDAOAddress}`);

            const transferTx = await modelDAORewardsFacetContract.transferOwnership(modelDAOAddress);
            await transferTx.wait();

            const newOwner = await modelDAORewardsFacetContract.owner();
            console.log(`   ✅ ModelDAORewardsFacet ownership transferred to: ${newOwner}`);

            if (newOwner === modelDAOAddress) {
                console.log(`   ✅ ModelDAORewardsFacet ownership successfully transferred to ModelDAO`);
                return true;
            } else {
                console.warn(`   ⚠️ ModelDAORewardsFacet ownership transfer may have failed`);
                return false;
            }
        } catch (error) {
            console.error(`   ❌ Failed to transfer ModelDAORewardsFacet ownership: ${error.message}`);
            return false;
        }
    }

    /**
     * Fund ModelDAO contract with ETH for governance transactions
     * @param {string} modelDAOAddress - ModelDAO contract address
     * @param {string} fundingAmount - Amount to fund in ETH (as string)
     */
    async fundModelDAO(modelDAOAddress, fundingAmount = '100.0') {
        console.log('   💰 Funding ModelDAO contract for governance transactions...');

        try {
            const amount = this.ethers.parseEther(fundingAmount);
            console.log(`   🔗 Sending ${this.ethers.formatEther(amount)} LCAI to ModelDAO...`);

            const fundTx = await this.deployer.sendTransaction({
                to: modelDAOAddress,
                value: amount
            });

            console.log(`   ⏳ Waiting for funding transaction...`);
            const fundReceipt = await fundTx.wait();

            if (fundReceipt.status === 1) {
                console.log(`   ✅ Successfully funded ModelDAO with ${fundingAmount} LCAI testnet`);
                console.log(`   🔗 Funding transaction: ${fundReceipt.hash}`);
                console.log(`   🔗 Explorer: ${this.explorerUrl}/tx/${fundReceipt.hash}`);
                return true;
            } else {
                console.warn(`   ⚠️ Funding transaction failed`);
                return false;
            }
        } catch (error) {
            console.error(`   ❌ Failed to fund ModelDAO contract: ${error.message}`);
            console.error(`   💡 You can manually fund the contract later by sending ETH to: ${modelDAOAddress}`);
            return false;
        }
    }

    /**
     * Fund ModelDAORewardsFacet contract with ETH for reward distributions
     * @param {string} modelDAORewardsFacetAddress - ModelDAORewardsFacet contract address
     * @param {string} fundingAmount - Amount to fund in ETH (as string)
     */
    async fundModelDAORewardsFacet(modelDAORewardsFacetAddress, fundingAmount = '100.0') {
        console.log('   💰 Funding ModelDAORewardsFacet contract for reward distributions...');

        try {
            const amount = this.ethers.parseEther(fundingAmount);
            console.log(`   🔗 Sending ${this.ethers.formatEther(amount)} ETH to ModelDAORewardsFacet...`);

            const fundTx = await this.deployer.sendTransaction({
                to: modelDAORewardsFacetAddress,
                value: amount
            });

            console.log(`   ⏳ Waiting for funding transaction...`);
            const fundReceipt = await fundTx.wait();

            if (fundReceipt.status === 1) {
                console.log(`   ✅ Successfully funded ModelDAORewardsFacet with ${fundingAmount} ETH`);
                console.log(`   🔗 Funding transaction: ${fundReceipt.hash}`);
                console.log(`   🔗 Explorer: ${this.explorerUrl}/tx/${fundReceipt.hash}`);

                // Log the contract balance after funding
                const contractBalance = await this.deployer.provider.getBalance(modelDAORewardsFacetAddress);
                console.log(`   💰 ModelDAORewardsFacet contract balance: ${this.ethers.formatEther(contractBalance)} ETH`);

                return true;
            } else {
                console.warn(`   ⚠️ Funding transaction failed`);
                return false;
            }
        } catch (error) {
            console.error(`   ❌ Failed to fund ModelDAORewardsFacet contract: ${error.message}`);
            console.error(`   💡 You can manually fund the contract later by sending ETH to: ${modelDAORewardsFacetAddress}`);
            return false;
        }
    }


    /**
     * Fund LCAIChatUtility contract with ETH for reward distributions
     * @param {string} chatUtilityAddress - LCAIChatUtility contract address
     * @param {string} fundingAmount - Amount to fund in ETH (as string)
     */
    async fundChatUtility(chatUtilityAddress, fundingAmount = '100.0') {
        console.log('   💰 Funding LCAIChatUtility contract for reward distributions...');

        try {
            const amount = this.ethers.parseEther(fundingAmount);
            console.log(`   🔗 Sending ${this.ethers.formatEther(amount)} LCAI to LCAIChatUtility...`);

            const fundTx = await this.deployer.sendTransaction({
                to: chatUtilityAddress,
                value: amount
            });

            console.log(`   ⏳ Waiting for funding transaction...`);
            const fundReceipt = await fundTx.wait();

            if (fundReceipt.status === 1) {
                console.log(`   ✅ Successfully funded LCAIChatUtility with ${fundingAmount} LCAI`);
                console.log(`   🔗 Funding transaction: ${fundReceipt.hash}`);
                console.log(`   🔗 Explorer: ${this.explorerUrl}/tx/${fundReceipt.hash}`);

                // Log the contract balance after funding
                const contractBalance = await this.deployer.provider.getBalance(chatUtilityAddress);
                console.log(`   💰 LCAIChatUtility contract balance: ${this.ethers.formatEther(contractBalance)} LCAI`);

                return true;
            } else {
                console.warn(`   ⚠️ Funding transaction failed`);
                return false;
            }
        } catch (error) {
            console.error(`   ❌ Failed to fund LCAIChatUtility contract: ${error.message}`);
            console.error(`   💡 You can manually fund the contract later by sending LCAI to: ${chatUtilityAddress}`);
            return false;
        }
    }

    /**
     * Fund TimelockController contract with ETH for reward distributions
     * @param {string} timelockControllerAddress - TimelockControllerd contract address
     * @param {string} fundingAmount - Amount to fund in ETH (as string)
     */
    async fundTimelockController(timelockControllerAddress, fundingAmount = '100.0') {
        console.log('   💰 Funding TimelockController contract for reward distributions...');

        try {
            const amount = this.ethers.parseEther(fundingAmount);
            console.log(`   🔗 Sending ${this.ethers.formatEther(amount)} ETH to TimelockController...`);

            const fundTx = await this.deployer.sendTransaction({
                to: timelockControllerAddress,
                value: amount
            });

            console.log(`   ⏳ Waiting for funding transaction...`);
            const fundReceipt = await fundTx.wait();

            if (fundReceipt.status === 1) {
                console.log(`   ✅ Successfully funded TimelockController with ${fundingAmount} ETH`);
                console.log(`   🔗 Funding transaction: ${fundReceipt.hash}`);
                console.log(`   🔗 Explorer: ${this.explorerUrl}/tx/${fundReceipt.hash}`);

                // Log the contract balance after funding
                const contractBalance = await this.deployer.provider.getBalance(timelockControllerAddress);
                console.log(`   💰 TimelockController contract balance: ${this.ethers.formatEther(contractBalance)} ETH`);

                return true;
            } else {
                console.warn(`   ⚠️ Funding transaction failed`);
                return false;
            }
        } catch (error) {
            console.error(`   ❌ Failed to fund TimelockController contract: ${error.message}`);
            console.error(`   💡 You can manually fund the contract later by sending ETH to: ${timelockControllerAddress}`);
            return false;
        }
    }

    /**
     * Verify TimelockController roles after deployment
     * @param {string} timelockAddress - TimelockController contract address
     */
    async verifyTimelockRoles(timelockAddress) {
        console.log('   🔍 Verifying TimelockController roles...');

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);

            const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
            const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();
            const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, this.deployer.address);
            const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, this.deployer.address);

            console.log(`   ✅ Deployer has PROPOSER_ROLE: ${hasProposerRole}`);
            console.log(`   ✅ Deployer has EXECUTOR_ROLE: ${hasExecutorRole}`);

            return { hasProposerRole, hasExecutorRole };
        } catch (error) {
            console.warn(`   ⚠️ Failed to verify TimelockController roles: ${error.message}`);
            return { hasProposerRole: false, hasExecutorRole: false };
        }
    }

    /**
     * Verify ModelDAORewardsFacet initial configuration
     * @param {string} modelDAORewardsFacetAddress - ModelDAORewardsFacet contract address
     */
    async verifyModelDAORewardsFacetConfig(modelDAORewardsFacetAddress) {
        console.log('   🔍 Verifying ModelDAORewardsFacet initial configuration...');

        try {
            const modelDAORewardsFacetContract = await this.ethers.getContractAt('ModelDAORewardsFacet', modelDAORewardsFacetAddress, this.deployer);

            const daoAddress = await modelDAORewardsFacetContract.modelDAO();
            const ownerAddress = await modelDAORewardsFacetContract.owner();

            console.log(`   ✅ ModelDAORewardsFacet modelDAO: ${daoAddress}`);
            console.log(`   ✅ ModelDAORewardsFacet owner: ${ownerAddress}`);
            console.log(`   ⚠️ ModelDAORewardsFacet modelDAO will be updated after ModelDAO deployment`);

            return { daoAddress, ownerAddress };
        } catch (error) {
            console.warn(`   ⚠️ Failed to verify ModelDAORewardsFacet configuration: ${error.message}`);
            return { daoAddress: null, ownerAddress: null };
        }
    }

    /**
     * Configure initial ModelDAO settings after deployment
     * @param {string} modelDAOAddress - ModelDAO contract address
     * @param {string} timelockAddress - TimelockController contract address
     */
    async configureModelDAO(modelDAOAddress, timelockAddress) {
        console.log('   🔧 Configuring initial ModelDAO settings...');

        try {
            const modelDAOContract = await this.ethers.getContractAt('ModelDAODiamond', modelDAOAddress, this.deployer);

            // Basic configuration verification
            const rewardVault = await modelDAOContract.rewardVault();
            const timelock = await modelDAOContract.timelock();
            const owner = await modelDAOContract.owner();
            const quorumNumerator = await modelDAOContract.quorumNumerator();
            const chatFee = await modelDAOContract.chatFeeLCAI();

            console.log(`   ✅ ModelDAO rewardVault: ${rewardVault}`);
            console.log(`   ✅ ModelDAO timelock: ${timelock}`);
            console.log(`   ✅ ModelDAO owner: ${owner}`);
            console.log(`   ✅ ModelDAO quorum numerator: ${quorumNumerator}%`);
            console.log(`   ✅ ModelDAO chat fee: ${this.ethers.formatEther(chatFee)} LCAI`);

            // Note: Presale participants are managed by ModelTreasury now
            // Validator registration is handled by the ModelDAOValidatorsFacet
            // Moderator functionality has been removed

            return true;
        } catch (error) {
            console.error(`   ❌ Failed to configure ModelDAO: ${error.message}`);
            return false;
        }
    }

    /**
     * Configure initial ModelDAORewardsFacet settings
     * @param {string} modelDAORewardsFacetAddress - ModelDAORewardsFacet contract address
     * @param {string} timelockAddress - TimelockController contract address
     */
    async configureModelDAORewardsFacet(modelDAORewardsFacetAddress, timelockAddress) {
        console.log('   🔧 Configuring initial ModelDAORewardsFacet settings...');

        try {
            const modelDAORewardsFacetContract = await this.ethers.getContractAt('ModelDAORewardsFacet', modelDAORewardsFacetAddress, this.deployer);

            // Note: ModelDAORewardsFacet functions are now handled by the Diamond pattern
            // Basic configuration verification
            const modelDAO = await modelDAORewardsFacetContract.modelDAO();
            const owner = await modelDAORewardsFacetContract.owner();

            console.log(`   ✅ ModelDAORewardsFacet modelDAO: ${modelDAO}`);
            console.log(`   ✅ ModelDAORewardsFacet owner: ${owner}`);
            console.log('   💡 ModelDAORewardsFacet functionality is now handled by ModelDAODiamond');

            return true;
        } catch (error) {
            console.error(`   ❌ Failed to configure ModelDAORewardsFacet: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify final ModelDAO configuration after all setup
     * @param {string} modelDAOAddress - ModelDAO contract address
     */
    async verifyModelDAOConfig(modelDAOAddress) {
        console.log('   🔍 Verifying final ModelDAO configuration...');

        try {
            const modelDAOContract = await this.ethers.getContractAt('ModelDAODiamond', modelDAOAddress, this.deployer);

            const rewardVault = await modelDAOContract.rewardVault();
            const timelock = await modelDAOContract.timelock();
            const owner = await modelDAOContract.owner();
            const quorumNumerator = await modelDAOContract.quorumNumerator();
            const chatFee = await modelDAOContract.chatFeeLCAI();
            console.log(`   ✅ ModelDAO rewardVault: ${rewardVault}`);
            console.log(`   ✅ ModelDAO timelock: ${timelock}`);
            console.log(`   ✅ ModelDAO owner: ${owner}`);
            console.log(`   ✅ ModelDAO quorum numerator: ${quorumNumerator}%`);
            console.log(`   ✅ ModelDAO chat fee: ${this.ethers.formatEther(chatFee)} LCAI`);

            return true;
        } catch (error) {
            console.warn(`   ⚠️ Failed to verify ModelDAO configuration: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify final ModelDAORewardsFacet configuration after all setup
     * @param {string} modelDAORewardsFacetAddress - ModelDAORewardsFacet contract address
     */
    async verifyFinalModelDAORewardsFacetConfig(modelDAORewardsFacetAddress) {
        console.log('   🔍 Verifying final ModelDAORewardsFacet configuration...');

        try {
            const modelDAORewardsFacetContract = await this.ethers.getContractAt('ModelDAORewardsFacet', modelDAORewardsFacetAddress, this.deployer);

            const modelDAO = await modelDAORewardsFacetContract.modelDAO();
            const owner = await modelDAORewardsFacetContract.owner();
            const contractBalance = await this.deployer.provider.getBalance(modelDAORewardsFacetAddress);

            console.log(`   ✅ ModelDAORewardsFacet modelDAO: ${modelDAO}`);
            console.log(`   ✅ ModelDAORewardsFacet owner: ${owner}`);
            console.log(`   ✅ ModelDAORewardsFacet contract balance: ${this.ethers.formatEther(contractBalance)} ETH`);
            console.log('   💡 ModelDAORewardsFacet functionality is now handled by ModelDAODiamond');

            return true;
        } catch (error) {
            console.warn(`   ⚠️ Failed to verify ModelDAORewardsFacet configuration: ${error.message}`);
            return false;
        }
    }

    /**
     * Grant EXECUTOR_ROLE to a specific address on TimelockController
     * @param {string} timelockAddress - TimelockController contract address
     * @param {string} targetAddress - Address to grant EXECUTOR_ROLE to
     */
    async grantExecutorRole(timelockAddress, targetAddress) {
        console.log(`   🔧 Granting EXECUTOR_ROLE to ${targetAddress}...`);

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);
            const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();

            // Check if target already has the role
            const hasRole = await timelockContract.hasRole(EXECUTOR_ROLE, targetAddress);
            if (hasRole) {
                console.log(`   ✅ ${targetAddress} already has EXECUTOR_ROLE`);
                return true;
            }

            // Grant the role
            const grantTx = await timelockContract.grantRole(EXECUTOR_ROLE, targetAddress);
            await grantTx.wait();
            console.log(`   ✅ Granted EXECUTOR_ROLE to ${targetAddress}`);

            // Verify the role was granted
            const newHasRole = await timelockContract.hasRole(EXECUTOR_ROLE, targetAddress);
            console.log(`   ✅ ${targetAddress} now has EXECUTOR_ROLE: ${newHasRole}`);

            return true;
        } catch (error) {
            console.error(`   ❌ Failed to grant EXECUTOR_ROLE to ${targetAddress}: ${error.message}`);
            return false;
        }
    }

    /**
     * Check and fix all TimelockController roles for a specific address
     * @param {string} timelockAddress - TimelockController contract address
     * @param {string} targetAddress - Address to check and fix roles for
     */
    async checkAndFixTimelockRoles(timelockAddress, targetAddress) {
        console.log(`   🔍 Checking and fixing TimelockController roles for ${targetAddress}...`);

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);

            const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
            const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();
            const DEFAULT_ADMIN_ROLE = await timelockContract.DEFAULT_ADMIN_ROLE();

            // Check current roles
            const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, targetAddress);
            const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, targetAddress);
            const hasAdminRole = await timelockContract.hasRole(DEFAULT_ADMIN_ROLE, targetAddress);

            console.log(`   📋 Current roles for ${targetAddress}:`);
            console.log(`      PROPOSER_ROLE: ${hasProposerRole}`);
            console.log(`      EXECUTOR_ROLE: ${hasExecutorRole}`);
            console.log(`      DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);

            // Fix missing roles
            if (!hasProposerRole) {
                console.log(`   🔧 Granting PROPOSER_ROLE to ${targetAddress}...`);
                const grantTx = await timelockContract.grantRole(PROPOSER_ROLE, targetAddress);
                await grantTx.wait();
                console.log(`   ✅ Granted PROPOSER_ROLE to ${targetAddress}`);
            }

            if (!hasExecutorRole) {
                console.log(`   🔧 Granting EXECUTOR_ROLE to ${targetAddress}...`);
                const grantTx = await timelockContract.grantRole(EXECUTOR_ROLE, targetAddress);
                await grantTx.wait();
                console.log(`   ✅ Granted EXECUTOR_ROLE to ${targetAddress}`);
            }

            // Verify final roles
            const finalProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, targetAddress);
            const finalExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, targetAddress);

            console.log(`   ✅ Final roles for ${targetAddress}:`);
            console.log(`      PROPOSER_ROLE: ${finalProposerRole}`);
            console.log(`      EXECUTOR_ROLE: ${finalExecutorRole}`);

            return { hasProposerRole: finalProposerRole, hasExecutorRole: finalExecutorRole };
        } catch (error) {
            console.error(`   ❌ Failed to check and fix roles for ${targetAddress}: ${error.message}`);
            return { hasProposerRole: false, hasExecutorRole: false };
        }
    }

    /**
     * Grant PROPOSER_ROLE to a specific address on TimelockController
     * @param {string} timelockAddress - TimelockController contract address
     * @param {string} targetAddress - Address to grant PROPOSER_ROLE to
     */
    async grantProposerRole(timelockAddress, targetAddress) {
        console.log(`   🔧 Granting PROPOSER_ROLE to ${targetAddress}...`);

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);
            const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();

            // Check if target already has the role
            const hasRole = await timelockContract.hasRole(PROPOSER_ROLE, targetAddress);
            if (hasRole) {
                console.log(`   ✅ ${targetAddress} already has PROPOSER_ROLE`);
                return true;
            }

            // Grant the role
            const grantTx = await timelockContract.grantRole(PROPOSER_ROLE, targetAddress);
            await grantTx.wait();
            console.log(`   ✅ Granted PROPOSER_ROLE to ${targetAddress}`);

            // Verify the role was granted
            const newHasRole = await timelockContract.hasRole(PROPOSER_ROLE, targetAddress);
            console.log(`   ✅ ${targetAddress} now has PROPOSER_ROLE: ${newHasRole}`);

            return true;
        } catch (error) {
            console.error(`   ❌ Failed to grant PROPOSER_ROLE to ${targetAddress}: ${error.message}`);
            return false;
        }
    }

    /**
     * Enable open execution by granting EXECUTOR_ROLE to zero address
     * @param {string} timelockAddress - TimelockController contract address
     */
    async enableOpenExecution(timelockAddress) {
        console.log(`   🔧 Enabling open execution for testing...`);

        try {
            const timelockContract = await this.ethers.getContractAt('TimelockController', timelockAddress, this.deployer);
            const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();

            // Check if open execution is already enabled
            const hasRole = await timelockContract.hasRole(EXECUTOR_ROLE, this.ethers.ZeroAddress);
            if (hasRole) {
                console.log(`   ✅ Open execution already enabled`);
                return true;
            }

            // Grant the role to zero address (enables open execution)
            const grantTx = await timelockContract.grantRole(EXECUTOR_ROLE, this.ethers.ZeroAddress);
            await grantTx.wait();
            console.log(`   ✅ Open execution enabled (zero address has EXECUTOR_ROLE)`);

            return true;
        } catch (error) {
            console.error(`   ❌ Failed to enable open execution: ${error.message}`);
            return false;
        }
    }

    // ======================================================================
    // NEW 4-CONTRACT ARCHITECTURE METHODS
    // ======================================================================

    /**
     * Fund ModelTreasury contract with ETH for protocol operations
     * @param {string} treasuryAddress - ModelTreasury contract address
     * @param {string} fundingAmount - Amount to fund in ETH (as string)
     */
    async fundModelTreasury(treasuryAddress, fundingAmount = '100.0') {
        console.log('   💰 Funding ModelTreasury contract for protocol operations...');

        try {
            const amount = this.ethers.parseEther(fundingAmount);
            console.log(`   🔗 Sending ${this.ethers.formatEther(amount)} ETH to ModelTreasury...`);

            const fundTx = await this.deployer.sendTransaction({
                to: treasuryAddress,
                value: amount
            });

            console.log(`   ⏳ Waiting for funding transaction...`);
            const fundReceipt = await fundTx.wait();

            if (fundReceipt.status === 1) {
                console.log(`   ✅ Successfully funded ModelTreasury with ${fundingAmount} ETH`);
                console.log(`   🔗 Funding transaction: ${fundReceipt.hash}`);
                console.log(`   🔗 Explorer: ${this.explorerUrl}/tx/${fundReceipt.hash}`);

                // Log the contract balance after funding
                const contractBalance = await this.deployer.provider.getBalance(treasuryAddress);
                console.log(`   💰 ModelTreasury contract balance: ${this.ethers.formatEther(contractBalance)} ETH`);

                return true;
            } else {
                console.warn(`   ⚠️ Funding transaction failed`);
                return false;
            }
        } catch (error) {
            console.error(`   ❌ Failed to fund ModelTreasury contract: ${error.message}`);
            console.error(`   💡 You can manually fund the contract later by sending ETH to: ${treasuryAddress}`);
            return false;
        }
    }

    /**
     * Configure initial ModelTreasury settings
     * @param {string} treasuryAddress - ModelTreasury contract address
     * @param {string} modelDAOAddress - ModelDAO contract address
     * @param {string} timelockAddress - TimelockController contract address
     */
    async configureModelTreasury(treasuryAddress, modelDAOAddress, timelockAddress) {
        console.log('   🔧 Configuring initial ModelTreasury settings...');

        try {
            const treasuryContract = await this.ethers.getContractAt('ModelTreasury', treasuryAddress, this.deployer);

            // Note: ModelTreasury functions require timelock permissions
            // For now, just verify basic configuration
            const modelDAO = await treasuryContract.modelDAO();
            const timelock = await treasuryContract.timelock();
            const owner = await treasuryContract.owner();
            const treasuryBalance = await treasuryContract.getTreasuryBalance();

            console.log(`   ✅ ModelTreasury modelDAO: ${modelDAO}`);
            console.log(`   ✅ ModelTreasury timelock: ${timelock}`);
            console.log(`   ✅ ModelTreasury owner: ${owner}`);
            console.log(`   ✅ ModelTreasury balance: ${this.ethers.formatEther(treasuryBalance)} ETH`);

            console.log('   💡 ModelTreasury allocations will be configured via governance proposals');

            return true;
        } catch (error) {
            console.error(`   ❌ Failed to configure ModelTreasury: ${error.message}`);
            return false;
        }
    }

    /**
     * Set up presale allocations in ModelTreasury
     * @param {string} treasuryAddress - ModelTreasury contract address
     */
    async setupPresaleAllocations(treasuryAddress) {
        console.log('   🔧 Setting up presale allocations...');

        try {
            const treasuryContract = await this.ethers.getContractAt('ModelTreasury', treasuryAddress, this.deployer);

            // Note: Presale allocations require timelock permissions
            // For now, just verify current state
            const totalPresaleAllocation = await treasuryContract.totalPresaleAllocation();
            const presaleParticipants = await treasuryContract.getAllPresaleParticipants();

            console.log(`   ✅ Total presale allocation: ${this.ethers.formatEther(totalPresaleAllocation)} LCAI`);
            console.log(`   ✅ Presale participants count: ${presaleParticipants.length}`);
            console.log('   💡 Presale allocations will be configured via governance proposals');

            return true;
        } catch (error) {
            console.error(`   ❌ Failed to setup presale allocations: ${error.message}`);
            return false;
        }
    }

    /**
     * Configure ModelUpgradeProxy
     * @param {string} upgradeProxyAddress - ModelUpgradeProxy contract address
     * @param {string} modelDAOAddress - ModelDAO contract address
     */
    async configureModelUpgradeProxy(upgradeProxyAddress, modelDAOAddress) {
        console.log('   🔧 Configuring ModelUpgradeProxy...');

        try {
            const upgradeProxyContract = await this.ethers.getContractAt('ModelUpgradeProxy', upgradeProxyAddress, this.deployer);

            // Verify the proxy is properly configured
            const modelDAO = await upgradeProxyContract.modelDAO();
            const owner = await upgradeProxyContract.owner();

            console.log(`   ✅ ModelUpgradeProxy modelDAO: ${modelDAO}`);
            console.log(`   ✅ ModelUpgradeProxy owner: ${owner}`);

            // Verify that the proxy is configured with the correct ModelDAO
            if (modelDAO === modelDAOAddress) {
                console.log(`   ✅ ModelUpgradeProxy properly configured with ModelDAODiamond`);
                return true;
            } else {
                console.warn(`   ⚠️ ModelUpgradeProxy configuration mismatch`);
                return false;
            }
        } catch (error) {
            console.error(`   ❌ Failed to configure ModelUpgradeProxy: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify final ModelTreasury configuration after all setup
     * @param {string} treasuryAddress - ModelTreasury contract address
     */
    async verifyFinalModelTreasuryConfig(treasuryAddress) {
        console.log('   🔍 Verifying final ModelTreasury configuration...');

        try {
            const treasuryContract = await this.ethers.getContractAt('ModelTreasury', treasuryAddress, this.deployer);

            const modelDAO = await treasuryContract.modelDAO();
            const timelock = await treasuryContract.timelock();
            const owner = await treasuryContract.owner();
            const totalAllocated = await treasuryContract.totalAllocated();
            const totalPresaleAllocation = await treasuryContract.totalPresaleAllocation();
            const treasuryBalance = await treasuryContract.getTreasuryBalance();
            const allocationNames = await treasuryContract.getAllAllocationNames();
            const presaleParticipants = await treasuryContract.getAllPresaleParticipants();

            console.log(`   ✅ ModelTreasury modelDAO: ${modelDAO}`);
            console.log(`   ✅ ModelTreasury timelock: ${timelock}`);
            console.log(`   ✅ ModelTreasury owner: ${owner}`);
            console.log(`   ✅ ModelTreasury total allocated: ${this.ethers.formatEther(totalAllocated)} ETH`);
            console.log(`   ✅ ModelTreasury total presale allocation: ${this.ethers.formatEther(totalPresaleAllocation)} LCAI`);
            console.log(`   ✅ ModelTreasury balance: ${this.ethers.formatEther(treasuryBalance)} ETH`);
            console.log(`   ✅ ModelTreasury allocation count: ${allocationNames.length}`);
            console.log(`   ✅ ModelTreasury presale participants: ${presaleParticipants.length}`);

            return true;
        } catch (error) {
            console.warn(`   ⚠️ Failed to verify ModelTreasury configuration: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify final ModelUpgradeProxy configuration after all setup
     * @param {string} upgradeProxyAddress - ModelUpgradeProxy contract address
     */
    async verifyFinalModelUpgradeProxyConfig(upgradeProxyAddress) {
        console.log('   🔍 Verifying final ModelUpgradeProxy configuration...');

        try {
            const upgradeProxyContract = await this.ethers.getContractAt('ModelUpgradeProxy', upgradeProxyAddress, this.deployer);

            const modelDAO = await upgradeProxyContract.modelDAO();
            const owner = await upgradeProxyContract.owner();
            const contractBalance = await this.deployer.provider.getBalance(upgradeProxyAddress);

            console.log(`   ✅ ModelUpgradeProxy modelDAO: ${modelDAO}`);
            console.log(`   ✅ ModelUpgradeProxy owner: ${owner}`);
            console.log(`   ✅ ModelUpgradeProxy balance: ${this.ethers.formatEther(contractBalance)} ETH`);

            return true;
        } catch (error) {
            console.warn(`   ⚠️ Failed to verify ModelUpgradeProxy configuration: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify final ModelDAO configuration after all setup (updated for new architecture)
     * @param {string} modelDAOAddress - ModelDAO contract address
     */
    async verifyFinalModelDAOConfig(modelDAOAddress) {
        console.log('   🔍 Verifying final ModelDAO configuration...');

        try {
            const modelDAOContract = await this.ethers.getContractAt('ModelDAODiamond', modelDAOAddress, this.deployer);

            const rewardVault = await modelDAOContract.rewardVault();
            const timelock = await modelDAOContract.timelock();
            const owner = await modelDAOContract.owner();
            const quorumNumerator = await modelDAOContract.quorumNumerator();
            const chatFee = await modelDAOContract.chatFeeLCAI();
            const contractBalance = await this.deployer.provider.getBalance(modelDAOAddress);

            console.log(`   ✅ ModelDAO rewardVault: ${rewardVault}`);
            console.log(`   ✅ ModelDAO timelock: ${timelock}`);
            console.log(`   ✅ ModelDAO owner: ${owner}`);
            console.log(`   ✅ ModelDAO quorum numerator: ${quorumNumerator}%`);
            console.log(`   ✅ ModelDAO chat fee: ${this.ethers.formatEther(chatFee)} LCAI`);
            console.log(`   ✅ ModelDAO balance: ${this.ethers.formatEther(contractBalance)} ETH`);

            return true;
        } catch (error) {
            console.warn(`   ⚠️ Failed to verify ModelDAO configuration: ${error.message}`);
            return false;
        }
    }
}