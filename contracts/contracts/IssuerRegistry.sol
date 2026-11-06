// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Public directory of attestation issuers.
/// @notice Registration is open and grants no trust: the registry only publishes which key signs
/// for which issuer. Each requester keeps its own list of the issuerIds it accepts.
/// An issuer has two keys: `admin` (cold, manages the entry) and `signer` (signs attestations).
/// If the signer leaks, the admin rotates it; a single key could not be taken back.
contract IssuerRegistry {
    struct Issuer {
        address admin;
        address signer;
        string metadataURI;
    }

    mapping(bytes16 issuerId => Issuer) private _issuers;

    event IssuerRegistered(
        bytes16 indexed issuerId,
        address indexed admin,
        address indexed signer,
        string metadataURI
    );
    event SignerRotated(
        bytes16 indexed issuerId,
        address indexed previousSigner,
        address indexed newSigner
    );

    error InvalidIssuerId();
    error InvalidSigner();
    error IssuerExists(bytes16 issuerId);
    error UnknownIssuer(bytes16 issuerId);
    error NotIssuerAdmin(bytes16 issuerId, address caller);

    /// @param issuerId Random 128-bit id chosen by the issuer.
    /// @param metadataURI Public organisation metadata (name, website). Never holder data.
    function register(bytes16 issuerId, address signer, string calldata metadataURI) external {
        if (issuerId == bytes16(0)) revert InvalidIssuerId();
        if (signer == address(0)) revert InvalidSigner();
        if (_issuers[issuerId].admin != address(0)) revert IssuerExists(issuerId);
        _issuers[issuerId] = Issuer(msg.sender, signer, metadataURI);
        emit IssuerRegistered(issuerId, msg.sender, signer, metadataURI);
    }

    /// @notice Attestations anchored with the previous signer stay valid; revoke them if the key
    /// leaked.
    function rotateSigner(bytes16 issuerId, address newSigner) external {
        Issuer storage issuer = _get(issuerId);
        if (msg.sender != issuer.admin) revert NotIssuerAdmin(issuerId, msg.sender);
        if (newSigner == address(0) || newSigner == issuer.signer) revert InvalidSigner();
        emit SignerRotated(issuerId, issuer.signer, newSigner);
        issuer.signer = newSigner;
    }

    function getIssuer(bytes16 issuerId) external view returns (Issuer memory) {
        return _get(issuerId);
    }

    function _get(bytes16 issuerId) private view returns (Issuer storage issuer) {
        issuer = _issuers[issuerId];
        if (issuer.admin == address(0)) revert UnknownIssuer(issuerId);
    }
}
