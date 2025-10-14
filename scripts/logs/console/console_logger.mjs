//path: lcai-dao-smart-contract/scripts/logs/console/console_logger.mjs
import chalk from 'chalk';

/** 
 * Prints the` link with a label.
 * @param {string} label - The label for the link.
 * @param {string} url - The URL to print.
 * */

export function printLink(label, url) {
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
export function printExplorerContractLink(contractName, contractAddress, explorerUrl) {
    if (!explorerUrl || !contractAddress) return;
    let baseUrl = explorerUrl.endsWith('/') ? explorerUrl : explorerUrl + '/';
    const link = `${baseUrl}address/${contractAddress}`;
    console.log('📝  ', contractName, ' deployed at: ', contractAddress);
    console.log(`🔗 Explorer contract link for ${contractName}: ` + chalk.blue(link));
}

/**
 * Prints a standardized message for deploying a contract.
 * @param {string} contractName - The name of the contract (e.g., 'ModelToken').
 */
export function printDeployingContract(contractName) {
    console.log(`🚀 Attempting to deploy ${contractName} Contract...`);
}

/**
 * Prints the explorer transaction link for a transaction hash.
 * @param {string} txHash - The transaction hash.
 * @param {string} label - The label for the transaction link.
 * @param {string} explorerUrl - The base explorer URL (e.g., 'https://testnet.lightscan.app/').
 */
export function printExplorerTxLink(txHash, label, explorerUrl) {
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
export function printGrantRole(role, recipient) {
    console.log(`👑  Granting ${chalk.yellow(role)} to ${recipient}...`);
}

/**
 * Prints a standardized message for checking if a recipient has a role.
 * @param {string} role - The role being checked (e.g., 'VALIDATOR_ROLE').
 * @param {string} recipient - The address of the recipient.
 * @param {boolean} hasRole - Whether the recipient has the role.
 */
export function printHasRole(role, recipient, hasRole) {
    const status = hasRole ? chalk.green('✅ true') : chalk.red('❌ false');
    console.log(`🕵️   ${recipient} has ${chalk.yellow(role)}: ${status}`);
}

/**
 * Prints a section header with a title.
 * @param {string} title - The section title.
 */
export function printSectionHeader(title) {
    console.log(`\n=== ${title} ===`);
}

/**
 * Prints a step header with a title.
 * @param {string} step - The step description.
 */
export function printStepHeader(step) {
    console.log(`\n[${step}] \n`);
}

/**
 * Prints a label and an Ethereum address.
 * @param {string} label - The label for the address.
 * @param {string} address - The Ethereum address.
 */
export function printAddress(label, address) {
    console.log(`${label}: ${chalk.magenta(address)}`);
}

/**
 * Prints a token balance with a label.
 * @param {string} label - The label for the balance.
 * @param {string|number} balance - The balance value.
 * @param {string} tokenSymbol - The token symbol (e.g., 'LCAI').
 */
export function printTokenBalance(label, balance, tokenSymbol) {
    console.log(`💰 ${label}:  ${chalk.yellow(balance)} ${tokenSymbol}`);
}

/**
 * Prints a transaction hash with a label.
 * @param {string} label - The label for the transaction.
 * @param {string} txHash - The transaction hash.
 */
export function printTxHash(label, txHash) {
    console.log(`${label}: ${chalk.magentaBright(txHash)}`);
}

/**
 * Prints a success message.
 * @param {string} message - The success message.
 */
export function printSuccess(message) {
    console.log(chalk.green(`\n ✅ ${message} \n`));
}

/**
 * Prints an error message.
 * @param {string} message - The error message.
 */
export function printError(message) {
    console.log(chalk.red(`❌  ${message}`));
}

/**
 * Prints an informational message.
 * @param {string} message - The info message.
 */
export function printInfo(message) {
    console.log("\n" + message + "\n");
}

/**
 * Prints a debug key-value pair.
 * @param {string} key - The key or label.
 * @param {string|number} value - The value.
 */
export function printDebug(key, value) {
    console.log(chalk.gray(`\n  ${key}: ${value}`));
}

/**
 * Prints the gas used for a transaction.
 * @param {string|number} gasUsed - The gas used.
 */
export function printGasUsed(gasUsed) {
    console.log(`  Gas used: ${chalk.yellow(gasUsed)}`);
}

/**
 * Prints the allowance for a contract.
 * @param {string} owner - The owner address.
 * @param {string} spender - The spender address.
 * @param {string|number} allowance - The allowance value.
 * @param {string} tokenSymbol - The token symbol.
 */
export function printAllowance(owner, spender, allowance, tokenSymbol) {
    console.log(`  Allowance for ${chalk.magenta(owner)} → ${chalk.magenta(spender)}: ${chalk.yellow(allowance)} ${tokenSymbol}`);
}

/**
 * Prints the result of a contract state check.
 * @param {boolean} exists - Whether the contract code exists.
 * @param {number} codeLength - The length of the contract code.
 */
export function printContractStateCheck(exists, codeLength) {
    console.log(`  Contract code exists: ${exists ? chalk.green('yes') : chalk.red('no')}`);
    console.log(`  Contract code length: ${chalk.yellow(codeLength)}`);
}