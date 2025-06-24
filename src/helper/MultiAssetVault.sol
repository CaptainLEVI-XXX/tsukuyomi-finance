// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC6909} from "@solmate/tokens/ERC6909.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {CustomRevert} from "../libraries/CustomRevert.sol";

abstract contract MultiAssetVault is ERC6909 {
    using CustomRevert for bytes4;

    event Deposit(
        uint256 indexed tokenId, address indexed caller, address indexed owner, uint256 assets, uint256 shares
    );
    event Withdraw(
        uint256 indexed tokenId, address indexed owner, address indexed receiver, uint256 assets, uint256 shares
    );

    error AssetNotFound();
    error ZeroShares();

    struct TokenMetadata {
        string name;
        string symbol;
        uint8 decimals;
        address underlyingAsset;
        bool isRegistered;
    }

    mapping(uint256 tokenId => TokenMetadata metadata) internal idToMetadata;
    mapping(uint256 tokenId => address asset) internal idToAsset;
    mapping(uint256 tokenId => uint256 totalSupply_) internal _totalSupply;
    uint256 id;
    
    constructor() {}

    function deposit(uint256 tokenId, uint256 assets,address caller, address receiver) internal returns (uint256 shares) {
        shares = previewDeposit(tokenId, assets);
        if (shares == 0) ZeroShares.selector.revertWith();
        address asset_ = idToAsset[tokenId];

        if (asset_ == address(0)) AssetNotFound.selector.revertWith();

        _mint(receiver, tokenId, shares);

        IERC20(asset_).transferFrom(caller, address(this), assets);

        emit Deposit(tokenId, caller, receiver, assets, shares);
    }

    function redeem(uint256 tokenId, uint256 shares, address receiver, address owner)
        public
        virtual
        returns (uint256 assets)
    {
        address asset_ = idToAsset[tokenId];
        if (asset_ == address(0)) AssetNotFound.selector.revertWith();
        assets = previewRedeem(tokenId, shares);
        if (assets == 0) ZeroShares.selector.revertWith();
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender][tokenId];
            if (allowed != type(uint256).max) {
                allowance[owner][msg.sender][tokenId] = allowed - shares;
            }
        }
        _burn(owner, tokenId, shares);
        IERC20(asset_).transfer(receiver, assets);
        emit Withdraw(tokenId, owner, receiver, assets, shares);
    }

    function withdraw(uint256 tokenId, uint256 assets, address receiver, address owner)
        public
        virtual
        returns (uint256 shares)
    {
        address asset_ = idToAsset[tokenId];
        if (asset_ == address(0)) AssetNotFound.selector.revertWith();
        shares = previewWithdraw(tokenId, assets);
        if (shares == 0) ZeroShares.selector.revertWith();
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender][tokenId];
            if (allowed != type(uint256).max) {
                allowance[owner][msg.sender][tokenId] = allowed - shares;
            }
        }

        _burn(owner, tokenId, shares);

        IERC20(asset_).transfer(owner, assets);

        emit Withdraw(tokenId, owner, receiver, assets, shares);
    }

    function mint(uint256 tokenId, uint256 shares, address caller, address receiver) internal virtual returns (uint256 assets) {
        address asset_ = idToAsset[tokenId];
        if (asset_ == address(0)) AssetNotFound.selector.revertWith();
        assets = previewMint(tokenId, shares);
        if (assets == 0) ZeroShares.selector.revertWith();

        _mint(receiver, tokenId, shares);

        IERC20(asset_).transferFrom(caller, address(this), assets);

        emit Deposit(tokenId, caller, receiver, assets, shares);
    }

    function asset(uint256 tokenId) public virtual returns (address) {
        return idToAsset[tokenId];
    }

    // Preview functions
    function previewDeposit(uint256 tokenId, uint256 assets) public view returns (uint256) {
        return convertToShares(tokenId, assets);
    }

    function previewMint(uint256 tokenId, uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply(tokenId);
        if (supply == 0) {
            return shares;
        } else {
            uint256 numerator = shares * totalAssets(tokenId);
            uint256 denominator = supply;
            return numerator / denominator;
        }
    }

    function previewRedeem(uint256 tokenId, uint256 shares) public view returns (uint256) {
        return convertToAssets(tokenId, shares);
    }

    function previewWithdraw(uint256 tokenId, uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply(tokenId);
        if (supply == 0) {
            return assets;
        } else {
            uint256 numerator = assets * supply;
            uint256 denominator = totalAssets(tokenId);
            return numerator / denominator;
        }
    }

    // Conversion functions
    function convertToShares(uint256 tokenId, uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply(tokenId);
        if (supply == 0) {
            return assets;
        } else {
            uint256 numerator = assets * supply;
            uint256 denominator = totalAssets(tokenId);
            return numerator / denominator;
        }
    }

    function convertToAssets(uint256 tokenId, uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply(tokenId);
        if (supply == 0) {
            return shares;
        } else {
            uint256 numerator = shares * totalAssets(tokenId);
            uint256 denominator = supply;
            return numerator / denominator;
        }
    }

    // Max functions
    function maxDeposit() public pure returns (uint256) {
        return type(uint256).max;
    }

    function maxMint() public pure returns (uint256) {
        return type(uint256).max;
    }

    function maxWithdraw() public pure returns (uint256) {
        return type(uint256).max;
    }

    function maxRedeem() public pure returns (uint256) {
        return type(uint256).max;
    }

    // Supply function
    function totalSupply(uint256 tokenId) public view returns (uint256) {
        return _totalSupply[tokenId];
    }

    function totalAssets(uint256 tokenId) public view returns (uint256 balance) {
        balance = IERC20(idToAsset[tokenId]).balanceOf(address(this));
        return balance;
    }

    function _mint(address owner, uint256 tokenId, uint256 amount) internal virtual override(ERC6909) {
        _totalSupply[tokenId] += amount;
        super._mint(owner, tokenId, amount);
    }

    function _burn(address owner, uint256 tokenId, uint256 amount) internal virtual override(ERC6909) {
        _totalSupply[tokenId] -= amount;
        super._burn(owner, tokenId, amount);
    }

    function name(uint256 tokenId) public view returns (string memory) {
        return idToMetadata[tokenId].name;
    }

    function symbol(uint256 tokenId) public view returns(string memory){
        return idToMetadata[tokenId].symbol;
    }

    function decimals(uint256 tokenId) public view returns(uint8){
        return idToMetadata[tokenId].decimals;
    }

}