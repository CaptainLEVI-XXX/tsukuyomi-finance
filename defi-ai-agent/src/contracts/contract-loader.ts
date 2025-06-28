import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

export class ContractLoader {
    static loadABI(contractName: string): any {
        try {
            // Try multiple paths for flexibility
            const possiblePaths = [
                join(__dirname, '../../../out/', `${contractName}.sol`, `${contractName}.json`),
                join(__dirname, '../../../out/', `${contractName}.sol`, `${contractName}.abi.json`),
                join(__dirname, '../../contracts/abi/', `${contractName}.json`),
            ];
            
            for (const abiPath of possiblePaths) {
                if (existsSync(abiPath)) {
                    logger.info(`Loading ABI from: ${abiPath}`);
                    const contractJson = JSON.parse(readFileSync(abiPath, 'utf8'));
                    return contractJson.abi || contractJson;
                }
            }
            
            throw new Error(`ABI not found in any expected location`);
        } catch (error) {
            logger.error(`Failed to load ABI for ${contractName}:`, error);
            throw error;
        }
    }
    
    static getDeployedAddress(contractName: string, chainId: number): string {
        // You can read from a deployments file or use environment variables
        const deployments: Record<number, Record<string, string>> = {
            8453: { // Base
                'ICrossChainStrategyManager': process.env.STRATEGY_MANAGER_ADDRESS_BASE || ''
            },
            43114: { // Avalanche
                'ICrossChainStrategyManager': process.env.STRATEGY_MANAGER_ADDRESS_AVALANCHE || ''
            }
        };
        
        const address = deployments[chainId]?.[contractName];
        if (!address) {
            throw new Error(`No deployment found for ${contractName} on chain ${chainId}`);
        }
        
        return address;
    }
}