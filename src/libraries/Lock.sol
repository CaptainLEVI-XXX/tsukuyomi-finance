// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Lock
/// @notice Library for managing reentrancy protection
/// @dev Uses assembly to efficiently manage a storage slot for reentrancy checking
library Lock {
    /// @dev Storage slot for the unlocked state
    /// @dev bytes32(uint256(keccak256("Unlocked")) - 1)
    bytes32 internal constant IS_UNLOCKED_SLOT = 0xc090fc4683624cfc3884e9d8de5eca132f2d0ec062aff75d43c0465d5ceeab23;

    /// @dev Unlock the contract
    function unlock() internal {
        assembly ("memory-safe") {
            tstore(IS_UNLOCKED_SLOT, true)
        }
    }

    /// @dev Lock the contract
    function lock() internal {
        assembly ("memory-safe") {
            tstore(IS_UNLOCKED_SLOT, false)
        }
    }

    /// @dev Check if the contract is unlocked
    /// @return unlocked Whether the contract is unlocked
    function isUnlocked() internal view returns (bool unlocked) {
        assembly ("memory-safe") {
            unlocked := tload(IS_UNLOCKED_SLOT)
        }
    }
}
