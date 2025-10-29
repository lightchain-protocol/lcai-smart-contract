//path: lcai-dao-smart-contract/scripts/abi/saveAbi.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Save full ABI to abi/ directory in lcai-dao-smart-contract
 * @param contractName - The name of the contract
 * @param contractFactory - The contract factory with interface
 */
export function saveAbi(contractName: string, contractFactory: any): void {
    // Go up from scripts/abi/ to project root, then into abi/
    const abiPath = path.resolve(__dirname, '..', '..', 'abi');
    if (!fs.existsSync(abiPath)) {
        fs.mkdirSync(abiPath, { recursive: true });
    }

    const abi = JSON.stringify(contractFactory.interface.fragments, null, 2);
    fs.writeFileSync(path.join(abiPath, `${contractName}.json`), abi);
    console.log(`✅ ABI saved: ${contractName}.json → ${abiPath}`);
}

