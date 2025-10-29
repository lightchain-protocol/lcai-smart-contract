//path: lcai-dao-smart-contract/scripts/logs/console/console_logger.ts
import chalk from 'chalk';

/** 
 * Prints a link with a label.
 * @param label - The label for the link.
 * @param url - The URL to print.
 */
export function printLink(label: string, url: string): void {
    if (!url) return;
    // Ensure the URL starts with 'http://' or 'https://'
    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }
    // Print label in default, url in blue
    console.log(`${label}: ` + chalk.blue(url));
}

/**
 * Prints the explorer contract link for a deployed contract.
 * @param {string} contractName - The name of the contract (e.g., 'ModelReward').
 * @param {string} contractAddress - The deployed contract address.
 * @param {string} explorerUrl - The base explorer URL (e.g., 'https://testnet.lightscan.app/').
 */
export function printExplorerContractLink(contractName: string, contractAddress: string, explorerUrl: string): void {
    if (!explorerUrl || !contractAddress) return;
    let baseUrl = explorerUrl.endsWith('/') ? explorerUrl : explorerUrl + '/';
    const link = `${baseUrl}address/${contractAddress}`;
    console.log('📝  ', contractName, ' deployed at: ', contractAddress);
    console.log(`🔗 Explorer contract link for ${contractName}: ` + chalk.blue(link) + '\n');
}

/**
 * Prints a standardized message for deploying a contract.
 * @param {string} contractName - The name of the contract (e.g., 'ModelToken').
 */
export function printDeployingContract(contractName: string): void {
    console.log(`🚀 Attempting to deploy ${contractName} Contract...`);
}

/**
 * Prints the explorer transaction link for a transaction hash.
 * @param {string} txHash - The transaction hash.
 * @param {string} label - The label for the transaction link.
 * @param {string} explorerUrl - The base explorer URL (e.g., 'https://testnet.lightscan.app/').
 */
export function printExplorerTxLink(txHash: string, label: string, explorerUrl: string): void {
    if (explorerUrl && txHash) {
        // Ensure explorerUrl ends with '/tx/'
        let baseUrl = explorerUrl;
        if (!baseUrl.endsWith('/tx/')) {
            baseUrl = baseUrl.replace(/\/?$/, '/tx/');
        }
        // Print label in default, baseUrl+txHash in blue
        console.log(`  ${label}: ` + chalk.blue(`${baseUrl}${txHash}`));
    }
}

/**
 * Prints a standardized message for granting a role to a user.
 * @param {string} role - The role being granted (e.g., 'VALIDATOR_ROLE').
 * @param {string} recipient - The address of the recipient.
 */
export function printGrantRole(role: string, recipient: string): void {
    console.log(`👑  Granting ${chalk.yellow(role)} to ${recipient}...`);
}

/**
 * Prints a standardized message for checking if a recipient has a role.
 * @param {string} role - The role being checked (e.g., 'VALIDATOR_ROLE').
 * @param {string} recipient - The address of the recipient.
 * @param {boolean} hasRole - Whether the recipient has the role.
 */
export function printHasRole(role: string, recipient: string, hasRole: boolean): void {
    const status = hasRole ? chalk.green('✅ true') : chalk.red('❌ false');
    console.log(`🕵️   ${recipient} has ${chalk.yellow(role)}: ${status}`);
}

/**
 * Prints a section header with a title.
 * @param {string} title - The section title.
 */
export function printSectionHeader(title: string): void {
    console.log(`\n=== ${title} ===`);
}

/**
 * Prints a step header with a title.
 * @param {string} step - The step description.
 */
export function printStepHeader(step: string): void {
    console.log(`\n[${step}] \n`);
}

/**
 * Prints a label and an Ethereum address.
 * @param {string} label - The label for the address.
 * @param {string} address - The Ethereum address.
 */
export function printAddress(label: string, address: string): void {
    console.log(`${label}: ${chalk.magenta(address)}`);
}

/**
 * Prints a token balance with a label.
 * @param {string} label - The label for the balance.
 * @param {string|number} balance - The balance value.
 * @param {string} tokenSymbol - The token symbol (e.g., 'LCAI').
 */
export function printTokenBalance(label: string, balance: string | number, tokenSymbol: string): void {
    console.log(`💰 ${label}:  ${chalk.yellow(balance)} ${tokenSymbol}`);
}

/**
 * Prints a transaction hash with a label.
 * @param {string} label - The label for the transaction.
 * @param {string} txHash - The transaction hash.
 */
export function printTxHash(label: string, txHash: string): void {
    console.log(`${label}: ${chalk.magentaBright(txHash)}`);
}

/**
 * Prints a success message.
 * @param {string} message - The success message.
 */
export function printSuccess(message: string): void {
    console.log(chalk.green(`\n ✅ ${message} \n`));
}

/**
 * Prints an error message.
 * @param {string} message - The error message.
 */
export function printError(message: string): void {
    console.log(chalk.red(`❌  ${message}`));
}

/**
 * Prints an informational message.
 * @param {string} message - The info message.
 */
export function printInfo(message: string): void {
    console.log("\n" + message + "\n");
}

/**
 * Prints a debug key-value pair.
 * @param {string} key - The key or label.
 * @param {string|number} value - The value.
 */
export function printDebug(key: string, value: string | number): void {
    console.log(chalk.gray(`\n  ${key}: ${value}`));
}

/**
 * Prints the gas used for a transaction.
 * @param {string|number} gasUsed - The gas used.
 */
export function printGasUsed(gasUsed: string | number): void {
    console.log(`  Gas used: ${chalk.yellow(gasUsed)}`);
}

/**
 * Prints the allowance for a contract.
 * @param {string} owner - The owner address.
 * @param {string} spender - The spender address.
 * @param {string|number} allowance - The allowance value.
 * @param {string} tokenSymbol - The token symbol.
 */
export function printAllowance(owner: string, spender: string, allowance: string | number, tokenSymbol: string): void {
    console.log(`  Allowance for ${chalk.magenta(owner)} → ${chalk.magenta(spender)}: ${chalk.yellow(allowance)} ${tokenSymbol}`);
}

/**
 * Prints the result of a contract state check.
 * @param {boolean} exists - Whether the contract code exists.
 * @param {number} codeLength - The length of the contract code.
 */
export function printContractStateCheck(exists: boolean, codeLength: number): void {
    console.log(`  Contract code exists: ${exists ? chalk.green('yes') : chalk.red('no')}`);
    console.log(`  Contract code length: ${chalk.yellow(codeLength)}`);
}

// ==================== Deployment-Specific Functions ====================

/**
 * Prints a deployment header with title.
 * @param {string} title - The deployment title.
 */
export function printDeploymentHeader(title: string): void {
    console.log("\n" + chalk.cyan("=".repeat(60)));
    console.log(chalk.cyan.bold(title));
    console.log(chalk.cyan("=".repeat(60)) + "\n");
}

/**
 * Prints deployer account information.
 * @param {string} address - The deployer address.
 * @param {string} balance - The deployer balance.
 */
export function printDeployerInfo(address: string, balance: string): void {
    console.log(chalk.gray("Deploying contracts with account:"), chalk.magenta(address));
    console.log(chalk.gray("Account balance:"), chalk.yellow(balance), "ETH\n");
}

/**
 * Prints network information.
 * @param {string} networkName - The network name.
 * @param {string|number} chainId - The chain ID.
 */
export function printNetworkInfo(networkName: string, chainId: string | number): void {
    console.log(chalk.gray("Network:"), chalk.cyan(networkName));
    console.log(chalk.gray("Chain ID:"), chalk.cyan(chainId));
}

/**
 * Prints a contract deployment success message.
 * @param {string} contractName - The name of the deployed contract.
 * @param {string} address - The deployed contract address.
 */
export function printContractDeployed(contractName: string, address: string): void {
    console.log(chalk.green("✅"), contractName, "deployed to:", chalk.magenta(address));
}

/**
 * Prints a warning message.
 * @param {string} message - The warning message.
 */
export function printWarning(message: string): void {
    console.log(chalk.yellow("⚠️  " + message));
}

/**
 * Prints a section separator.
 * @param {number} length - The length of the separator (default 60).
 */
export function printSeparator(length = 60): void {
    console.log("=".repeat(length));
}

/**
 * Prints a step message with icon.
 * @param {string} message - The step message.
 */
export function printStep(message: string): void {
    console.log(chalk.cyan("🔧 " + message) + '\n');
}

/**
 * Prints a substep message with indentation.
 * @param {string} message - The substep message.
 */
export function printSubStep(message: string): void {
    console.log(chalk.gray("   " + message));
}

/**
 * Prints a config item.
 * @param {string} label - The config label.
 * @param {string|number} value - The config value.
 */
export function printConfig(label: string, value: string | number): void {
    console.log(chalk.gray("   " + label + ":"), chalk.yellow(value));
}

/**
 * Prints a summary section header.
 * @param {string} title - The summary section title.
 */
export function printSummarySection(title: string): void {
    console.log("\n" + chalk.bold(title));
}

/**
 * Prints deployment complete message.
 * @param {string} title - The completion title.
 */
export function printDeploymentComplete(title: string): void {
    console.log("\n" + chalk.green("=".repeat(60)));
    console.log(chalk.green.bold("✅ " + title));
    console.log(chalk.green("=".repeat(60)));
}

/**
 * Prints complete deployment summary with all contracts and configuration.
 * @param {object} summaryData - The deployment summary data object.
 */
export function printDeploymentSummary(summaryData: any): void {
    const {
        networkName,
        chainId,
        deployer,
        contracts,
        config,
        adminAddress,
        isAdminEOA,
        nextSteps
    } = summaryData;

    printDeploymentComplete("DAO GOVERNANCE SYSTEM DEPLOYMENT COMPLETE");

    console.log("\n📋 Deployment Summary:");
    console.log(`   Network: ${chalk.cyan(networkName)} (Chain ID: ${chalk.cyan(chainId)})`);
    console.log(`   Deployer: ${chalk.magenta(deployer)}`);

    console.log("\n📦 Deployed Contracts:");
    Object.entries(contracts).forEach(([name, address]) => {
        console.log(`   ${name}: ${chalk.magenta(address)}`);
    });

    console.log("\n⚙️  Configuration:");
    Object.entries(config).forEach(([key, value]) => {
        console.log(`   ${key}: ${chalk.yellow(value)}`);
    });

    if (isAdminEOA) {
        console.log("\n" + chalk.yellow("⚠️  SECURITY NOTICE:"));
        console.log(chalk.gray("   Admin is an EOA. For production:"));
        console.log(chalk.gray("   1. Create Gnosis Safe (5 owners, 3-of-5 threshold)"));
        console.log(chalk.gray("   2. Update admin via governance proposal"));
        console.log(chalk.gray("   3. See docs/GNOSIS_SAFE_DEPLOYMENT_RUNBOOK.md"));
    }

    console.log("\n📚 Next Steps:");
    nextSteps.forEach((step: string, i: number) => {
        console.log(chalk.gray(`   ${i + 1}. ${step}`));
    });

    console.log("\n" + "=".repeat(60) + "\n");
}