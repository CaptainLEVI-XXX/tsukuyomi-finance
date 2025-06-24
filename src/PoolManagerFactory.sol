// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CREATE3} from "@solady/utils/CREATE3.sol";
import {PoolManager} from "./PoolManager.sol";

/**
 * @title PoolManagerFactory
 * @notice Factory contract for deploying PoolManager contracts in a deterministic way
 */
contract PoolManagerFactory {
    // Storage for tracking the number of deployments
    uint256 private deploymentCount;

    // Event emitted when a new PoolManager is deployed
    event PoolManagerDeployed(address indexed poolManager);

    /**
     * @notice Constructor for the PoolManagerFactory
     */
    constructor() {}

    /**
     * @notice Deploys a new PoolManager contract with deterministic address
     * @param salt The salt used for deterministic deployment
     * @return The address of the deployed PoolManager contract
     */
    function deployNewContract(bytes32 salt) external returns (address) {
        // Create the initialization code for the PoolManager contract
        bytes memory initCode = abi.encodePacked(type(PoolManager).creationCode);

        // Deploy the contract using CREATE3 for deterministic address
        address poolManager = CREATE3.deployDeterministic(initCode, salt);

        // Update state
        deploymentCount++;

        // Emit event
        emit PoolManagerDeployed(poolManager);

        return poolManager;
    }

    /**
     * @notice Predicts the address where a contract will be deployed
     * @param salt The salt to be used in deployment
     * @return The predicted address of the contract
     */
    function predictAddress(bytes32 salt) external view returns (address) {
        // With CREATE3, the address only depends on the salt and the deployer (this contract)
        // not on the initialization code
        return CREATE3.predictDeterministicAddress(salt);
    }

    /**
     * @notice Returns the total number of deployments made by this factory
     * @return The number of deployments
     */
    function getDeploymentCount() external view returns (uint256) {
        return deploymentCount;
    }
}