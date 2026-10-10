/**
 * Well-known default development accounts generated from standard Hardhat test mnemonic:
 * "test test test test test test test test test test test junk".
 * Strictly prohibited on public testnets or production networks.
 */
export declare const KNOWN_DEV_ACCOUNTS: Set<string>;
export interface ProvenanceDeploymentResult {
    status: "DEPLOYED" | "DRY_RUN_HALTED";
    address?: string;
    chainId: number;
    networkName: string;
    deployer?: string;
    admin?: string;
    relayer?: string;
    bytecodeBytes?: number;
}
/**
 * Executes or preflights the PredictionProvenance smart contract deployment with explicit
 * role assignment (admin + pauser to AMOY_ADMIN_ADDRESS, writer to AMOY_RELAYER_ADDRESS)
 * and safe administrative handover from deployer to admin.
 */
export declare function runProvenanceDeployment(hreInstance?: any): Promise<ProvenanceDeploymentResult>;
//# sourceMappingURL=deploy-provenance.d.ts.map