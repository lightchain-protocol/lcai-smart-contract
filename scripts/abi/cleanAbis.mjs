//path: scripts/abi/cleanAbis.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deletes all files in the ABI output folder at abi/ in lcai-dao-smart-contract.
 * No arguments needed; resolves from project root.
 */
export function cleanAbis() {
    // Go up from scripts/abi/ to project root, then into abi/
    const abiDir = path.resolve(__dirname, '..', '..', 'abi');
    if (fs.existsSync(abiDir)) {
        fs.readdirSync(abiDir).forEach(file => {
            fs.unlinkSync(path.join(abiDir, file));
        });
        console.log(`🧹 Cleaned old ABIs from ${abiDir}`);
    } else {
        console.log(`📁 ABI directory does not exist: ${abiDir}`);
    }
}