// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IssuerRegistry} from "./IssuerRegistry.sol";

/// @title Anchors issuer-signed attestations and their revocation.
/// @notice Nothing about the holder or the attribute is stored: only the opaque attestation id,
/// the issuer, a salted commitment to the attestation content and its validity window.
/// The commitment is keccak256(abi.encode(bytes32 salt, bytes16 attestationId, address holder,
/// string attribute, string valueType, string valueJson)) with a random 32-byte salt, so a
/// low-entropy value cannot be found by trying every candidate.
/// Anyone may submit an anchor (the holder, a relayer): the EIP-712 signature proves the issuer.
/// The domain (name, version, chain id, this address) stops replay on another chain or contract,
/// the unique attestation id stops replay here.
contract AttestationRegistry is EIP712 {
    enum Status {
        Unknown,
        Active,
        Expired,
        Revoked
    }

    struct Anchor {
        bytes16 issuerId;
        address signer;
        uint64 issuedAt;
        uint64 expiresAt;
        uint64 revokedAt;
        bytes32 commitment;
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes16 attestationId,bytes16 issuerId,bytes32 commitment,uint64 issuedAt,uint64 expiresAt)"
    );

    IssuerRegistry public immutable issuers;
    mapping(bytes16 attestationId => Anchor) private _anchors;

    event AttestationAnchored(
        bytes16 indexed attestationId,
        bytes16 indexed issuerId,
        address indexed signer,
        bytes32 commitment,
        uint64 issuedAt,
        uint64 expiresAt
    );
    event AttestationRevoked(
        bytes16 indexed attestationId,
        bytes16 indexed issuerId,
        uint64 revokedAt
    );

    error InvalidAttestationId();
    error InvalidValidity();
    error AlreadyAnchored(bytes16 attestationId);
    error NotIssuerSigner(bytes16 issuerId, address signer);
    error UnknownAttestation(bytes16 attestationId);
    error AlreadyRevoked(bytes16 attestationId);
    error NotIssuer(bytes16 issuerId, address caller);

    constructor(IssuerRegistry issuerRegistry) EIP712("Glimpse", "1") {
        issuers = issuerRegistry;
    }

    function anchor(
        bytes16 attestationId,
        bytes16 issuerId,
        bytes32 commitment,
        uint64 issuedAt,
        uint64 expiresAt,
        bytes calldata signature
    ) external {
        if (attestationId == bytes16(0)) revert InvalidAttestationId();
        if (_anchors[attestationId].signer != address(0)) revert AlreadyAnchored(attestationId);
        if (issuedAt == 0 || issuedAt > block.timestamp || expiresAt <= block.timestamp) {
            revert InvalidValidity();
        }
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    attestationId,
                    issuerId,
                    commitment,
                    issuedAt,
                    expiresAt
                )
            )
        );
        address signer = ECDSA.recover(digest, signature);
        if (issuers.getIssuer(issuerId).signer != signer) revert NotIssuerSigner(issuerId, signer);

        _anchors[attestationId] = Anchor(issuerId, signer, issuedAt, expiresAt, 0, commitment);
        emit AttestationAnchored(attestationId, issuerId, signer, commitment, issuedAt, expiresAt);
    }

    /// @notice The issuer's admin or current signer revokes. A revocation is final.
    function revoke(bytes16 attestationId) external {
        Anchor storage a = _anchors[attestationId];
        if (a.signer == address(0)) revert UnknownAttestation(attestationId);
        if (a.revokedAt != 0) revert AlreadyRevoked(attestationId);
        IssuerRegistry.Issuer memory issuer = issuers.getIssuer(a.issuerId);
        if (msg.sender != issuer.admin && msg.sender != issuer.signer) {
            revert NotIssuer(a.issuerId, msg.sender);
        }
        a.revokedAt = uint64(block.timestamp);
        emit AttestationRevoked(attestationId, a.issuerId, a.revokedAt);
    }

    function getAnchor(bytes16 attestationId) external view returns (Anchor memory) {
        return _anchors[attestationId];
    }

    function statusOf(bytes16 attestationId) external view returns (Status) {
        Anchor storage a = _anchors[attestationId];
        if (a.signer == address(0)) return Status.Unknown;
        if (a.revokedAt != 0) return Status.Revoked;
        if (block.timestamp >= a.expiresAt) return Status.Expired;
        return Status.Active;
    }
}
