//path: lcai-dao-smart-contract/scripts/logs/data/data_logger.mjs
import fs from 'fs';
import path from 'path';
import { promises as fsp } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Appends an IPFS hash URL to the ipfs_hashes.json file.
 * @param {string} newHash - The IPFS CID hash to append.
 * @returns {Promise<void>} - A promise that resolves when the hash is appended.
 */
export async function appendHashToFile(newHash) {
    // Go up from scripts/logs/data/ to project root
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const hashesPath = path.join(projectRoot, 'data', 'ipfs', 'ipfs_hashes.json');
    let hashes = [];
    try {
        const data = await fsp.readFile(hashesPath, 'utf-8');
        hashes = JSON.parse(data);
    } catch (err) {
        // If file doesn't exist, start with empty array
        if (err.code !== 'ENOENT') throw err;
    }

    const fullUrl = `${process.env.IPFS_GATEWAY_URL || 'https://gateway.lighthouse.storage'}/ipfs/${newHash}`;
    if (!hashes.includes(fullUrl)) {
        hashes.push(fullUrl);
        await fsp.writeFile(hashesPath, JSON.stringify(hashes, null, 2));
        console.log('Appended new IPFS URL to ipfs_hashes.json');
    } else {
        console.log('IPFS URL already exists in ipfs_hashes.json');
    }
}

/**
 * Appends a log entry to a JSON file, creating the file and directory if needed.
 * @param {string} filePath - The path to the JSON log file.
 * @param {object} entry - The log entry to append.
 */
export function appendLog(filePath, entry) {
    const absPath = path.resolve(filePath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    let logs = [];
    if (fs.existsSync(absPath)) {
        try {
            logs = JSON.parse(fs.readFileSync(absPath, 'utf8'));
        } catch (e) {
            logs = [];
        }
    }
    logs.push(entry);
    fs.writeFileSync(absPath, JSON.stringify(logs, null, 2));
}

/**
 * Logs a new deployment set to the combined all_contract_addresses.json file.
 * @param {object} deploymentSet - The deployment set metadata (deploymentId, deployedAt, network, contracts).
 * Logs a new deployment set to contractsData.json in the front end as well.
 * The file is replaced entirely with just the new deployment set.
 */
export function logDeploymentsHistory(deploymentSet) {
    // Go up from scripts/logs/data/ to project root
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const filePath = path.join(projectRoot, 'data', 'deploymentsHistory.json');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Replace entire deployment history with just the new deployment
    const allDeployments = [deploymentSet];
    fs.writeFileSync(filePath, JSON.stringify(allDeployments, null, 2));
    console.log("Logged deployment set to deploymentsHistory.json in the backend");
    // log it again in the lib/data directory within lcai-dao-smart-contract
    const libDataPath = path.join(projectRoot, 'lib', 'data', 'contractsData.json');
    const libDataDir = path.dirname(libDataPath);

    if (!fs.existsSync(libDataDir)) {
        fs.mkdirSync(libDataDir, { recursive: true });
    }
    fs.writeFileSync(libDataPath, JSON.stringify(allDeployments, null, 2));
    console.log("Logged deployment set to contractsData.json in lib/data");
    console.log(`Logged deployment set to ${filePath} and ${libDataPath}`);
}



/**
 * Appends a transaction log entry to the transactions.json file.
 * @param {object} entry - The transaction log entry to append.
 */
export function appendTransactionLog(entry) {
    // Go up from scripts/logs/data/ to project root
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const txFile = path.join(projectRoot, 'data', 'transactions.json');
    const dir = path.dirname(txFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    let txs = [];
    if (fs.existsSync(txFile)) {
        try {
            txs = JSON.parse(fs.readFileSync(txFile, 'utf8'));
        } catch (e) {
            txs = [];
        }
    }
    txs.push(entry);
    fs.writeFileSync(txFile, JSON.stringify(txs, null, 2));
}

/**
 * Logs chat utility deployment to multiple locations in lcai-dao-smart-contract:
 * - data/deployments/chatUtilitydeploymentsHistory.json (appends to history)
 * - lib/data/chatUtilitycontractsData.json (replaces with latest)
 * @param {object} deploymentData - The deployment data to log.
 */
export function logChatUtilityDeployment(deploymentData) {
    // JSON serializer to handle BigInt
    const jsonSerializer = (key, value) => typeof value === 'bigint' ? value.toString() : value;

    // Go up from scripts/logs/data/ to project root
    const projectRoot = path.resolve(__dirname, '..', '..', '..');

    // 1. Append to deployment history
    const historyPath = path.join(projectRoot, 'data', 'deployments', 'chatUtilitydeploymentsHistory.json');
    const historyDir = path.dirname(historyPath);
    if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
    }

    let history = [];
    if (fs.existsSync(historyPath)) {
        try {
            history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        } catch (e) {
            console.warn(`⚠️ Could not read existing history, creating new:`, e.message);
            history = [];
        }
    }

    history.push(deploymentData);
    fs.writeFileSync(historyPath, JSON.stringify(history, jsonSerializer, 2));
    console.log(`📊 Deployment history logged to: ${historyPath}`);

    // 2. Save to lib/data directory (latest deployment only)
    const dataPath = path.join(projectRoot, 'lib', 'data', 'chatUtilitycontractsData.json');
    const dataDir = path.dirname(dataPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(frontendDataPath, JSON.stringify(deploymentData, jsonSerializer, 2));
    console.log(`📦 Frontend data saved to: ${frontendDataPath}`);

    // 3. Save to deployments directory (latest deployment only)
    const deploymentPath = path.resolve('deployments/chat-utility-deployment.json');
    const deploymentsDir = path.dirname(deploymentPath);
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentData, jsonSerializer, 2));
    console.log(`💾 Deployment info saved to: ${deploymentPath}`);
}