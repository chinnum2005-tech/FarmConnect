// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AgroTraceRegistry
 * @notice Canonical agricultural produce batch and supply-chain traceability registry.
 * @dev Anchors deterministic cryptographic commitments (bytes32) to an immutable ledger.
 *      Maintains full privacy by ensuring all personal, geographical, and commercial data
 *      remains off-chain.
 */
contract AgroTraceRegistry is AccessControl, Pausable {

    // Roles
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /**
     * @notice Canonical supply-chain stages matching AgroTrace business lifecycle.
     */
    enum EventType {
        PLANTED,        // 0: Initial seeding or field planting
        HARVESTED,      // 1: Crop harvested from field
        PROCESSED,      // 2: Post-harvest sorting, washing, grading
        PACKAGED,       // 3: Packaged into retail units or crates
        SHIPPED,        // 4: Dispatched for transport / in-transit
        RECEIVED,       // 5: Received at distribution hub or retailer
        QUALITY_CHECK,  // 6: Lab analysis or quality inspection
        RETAIL,         // 7: Stocked on retailer shelves
        SOLD            // 8: Consumer purchase completed
    }

    /**
     * @notice Individual immutable supply-chain trace event.
     */
    struct TraceEvent {
        EventType eventType;        // Stage in the supply chain
        bytes32 evidenceHash;       // SHA-256 / Keccak-256 hash of normalized off-chain evidence
        uint64 timestamp;           // Block timestamp of event inclusion
        address submitter;          // Truthful on-chain relayer or transaction sender (msg.sender)
        address originatingActor;   // Attested supply-chain actor (farmer, distributor, carrier)
    }

    /**
     * @notice Top-level metadata for a registered produce batch.
     */
    struct BatchRecord {
        bytes32 batchId;                 // Canonical unique batch identifier
        EventType initialEventType;      // Stage at registration (typically PLANTED or HARVESTED)
        bytes32 initialEvidenceHash;     // Initial evidence commitment
        uint64 registeredAt;             // Block timestamp of registration
        bool exists;                     // Existence flag
    }

    // Mapping from batchId => BatchRecord
    mapping(bytes32 => BatchRecord) private _batches;

    // Mapping from batchId => array of chronological TraceEvents
    mapping(bytes32 => TraceEvent[]) private _batchEvents;

    // Mapping to prevent duplicate event replay: keccak256(batchId, eventType, evidenceHash) => bool
    mapping(bytes32 => bool) private _recordedCommitments;

    // Events emitted for independent off-chain indexing
    event BatchRegistered(
        bytes32 indexed batchId,
        EventType indexed initialEventType,
        bytes32 indexed initialEvidenceHash,
        uint64 timestamp,
        address submitter,
        address originatingActor
    );

    event EventRecorded(
        bytes32 indexed batchId,
        EventType indexed eventType,
        bytes32 indexed evidenceHash,
        uint256 eventIndex,
        uint64 timestamp,
        address submitter,
        address originatingActor
    );

    /**
     * @notice Constructor initializes administrative, relayer, and pauser roles.
     * @param admin Address receiving DEFAULT_ADMIN_ROLE and PAUSER_ROLE
     * @param relayer Address receiving RELAYER_ROLE for transaction dispatch
     */
    constructor(address admin, address relayer) {
        require(admin != address(0), "Admin cannot be zero address");
        require(relayer != address(0), "Relayer cannot be zero address");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
    }

    // ==========================================
    // Emergency Controls (Pausable)
    // ==========================================

    /**
     * @notice Emergency pause for all state-modifying operations.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause contract and resume operations.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ==========================================
    // State-Changing Operations
    // ==========================================

    /**
     * @notice Registers a new produce batch with an atomic initial evidence commitment.
     * @dev Creates the batch summary AND appends the initial event at index 0 of `batchEvents`.
     * @param batchId Canonical 32-byte unique batch identifier
     * @param initialEventType Stage at registration (e.g. PLANTED or HARVESTED)
     * @param initialEvidenceHash 32-byte cryptographic hash of normalized initial produce evidence
     * @param originatingActor Supply-chain actor originating the registration (attested by relayer)
     */
    function registerBatch(
        bytes32 batchId,
        EventType initialEventType,
        bytes32 initialEvidenceHash,
        address originatingActor
    ) external whenNotPaused onlyRole(RELAYER_ROLE) {
        require(batchId != bytes32(0), "Batch ID cannot be zero");
        require(initialEvidenceHash != bytes32(0), "Evidence hash cannot be zero");
        require(!_batches[batchId].exists, "Batch already registered");

        // Prevent duplicate commitment replay
        bytes32 commitmentKey = keccak256(abi.encodePacked(batchId, initialEventType, initialEvidenceHash));
        require(!_recordedCommitments[commitmentKey], "Duplicate event commitment");
        _recordedCommitments[commitmentKey] = true;

        uint64 currentTimestamp = uint64(block.timestamp);

        // 1. Store batch summary
        _batches[batchId] = BatchRecord({
            batchId: batchId,
            initialEventType: initialEventType,
            initialEvidenceHash: initialEvidenceHash,
            registeredAt: currentTimestamp,
            exists: true
        });

        // 2. Atomically push initial event as index 0 in the chronological event history
        _batchEvents[batchId].push(TraceEvent({
            eventType: initialEventType,
            evidenceHash: initialEvidenceHash,
            timestamp: currentTimestamp,
            submitter: msg.sender,
            originatingActor: originatingActor
        }));

        // Emit registration event
        emit BatchRegistered(
            batchId,
            initialEventType,
            initialEvidenceHash,
            currentTimestamp,
            msg.sender,
            originatingActor
        );

        // Emit initial event recorded at index 0
        emit EventRecorded(
            batchId,
            initialEventType,
            initialEvidenceHash,
            0,
            currentTimestamp,
            msg.sender,
            originatingActor
        );
    }

    /**
     * @notice Records a subsequent supply-chain custody or processing event for an existing batch.
     * @param batchId Canonical 32-byte identifier of an already-registered batch
     * @param eventType Supply-chain stage of the new event
     * @param evidenceHash 32-byte cryptographic hash of normalized event evidence
     * @param originatingActor Supply-chain actor performing the action (attested by relayer)
     * @return eventIndex The zero-based chronological index of the newly recorded event
     */
    function recordEvent(
        bytes32 batchId,
        EventType eventType,
        bytes32 evidenceHash,
        address originatingActor
    ) external whenNotPaused onlyRole(RELAYER_ROLE) returns (uint256 eventIndex) {
        require(_batches[batchId].exists, "Batch does not exist");
        require(evidenceHash != bytes32(0), "Evidence hash cannot be zero");

        // Enforce precise duplicate prevention
        bytes32 commitmentKey = keccak256(abi.encodePacked(batchId, eventType, evidenceHash));
        require(!_recordedCommitments[commitmentKey], "Duplicate event commitment");
        _recordedCommitments[commitmentKey] = true;

        uint64 currentTimestamp = uint64(block.timestamp);
        eventIndex = _batchEvents[batchId].length;

        _batchEvents[batchId].push(TraceEvent({
            eventType: eventType,
            evidenceHash: evidenceHash,
            timestamp: currentTimestamp,
            submitter: msg.sender,
            originatingActor: originatingActor
        }));

        emit EventRecorded(
            batchId,
            eventType,
            evidenceHash,
            eventIndex,
            currentTimestamp,
            msg.sender,
            originatingActor
        );

        return eventIndex;
    }

    // ==========================================
    // Read-Only / Verification Queries
    // ==========================================

    /**
     * @notice Retrieve batch metadata and status.
     * @param batchId Canonical 32-byte batch identifier
     */
    function getBatch(bytes32 batchId)
        external
        view
        returns (
            bytes32 id,
            EventType initialEventType,
            bytes32 initialEvidenceHash,
            uint64 registeredAt,
            bool exists,
            uint256 eventCount
        )
    {
        BatchRecord memory b = _batches[batchId];
        return (
            b.batchId,
            b.initialEventType,
            b.initialEvidenceHash,
            b.registeredAt,
            b.exists,
            _batchEvents[batchId].length
        );
    }

    /**
     * @notice Returns total number of events recorded for a batch (including initial registration event).
     * @param batchId Canonical 32-byte batch identifier
     */
    function getEventCount(bytes32 batchId) external view returns (uint256) {
        return _batchEvents[batchId].length;
    }

    /**
     * @notice Retrieve a specific event by index (pagination support).
     * @param batchId Canonical 32-byte batch identifier
     * @param index Event index (0 <= index < eventCount)
     */
    function getEventByIndex(bytes32 batchId, uint256 index)
        public
        view
        returns (
            EventType eventType,
            bytes32 evidenceHash,
            uint64 timestamp,
            address submitter,
            address originatingActor
        )
    {
        require(index < _batchEvents[batchId].length, "Event index out of bounds");
        TraceEvent memory evt = _batchEvents[batchId][index];
        return (
            evt.eventType,
            evt.evidenceHash,
            evt.timestamp,
            evt.submitter,
            evt.originatingActor
        );
    }

    /**
     * @notice Alias for getEventByIndex to support standard query conventions.
     */
    function getTraceEvent(bytes32 batchId, uint256 index)
        external
        view
        returns (
            EventType eventType,
            bytes32 evidenceHash,
            uint64 timestamp,
            address submitter,
            address originatingActor
        )
    {
        return getEventByIndex(batchId, index);
    }

    /**
     * @notice Retrieve all events for a batch in a single read.
     * @param batchId Canonical 32-byte batch identifier
     */
    function getBatchEvents(bytes32 batchId) external view returns (TraceEvent[] memory) {
        return _batchEvents[batchId];
    }

    /**
     * @notice Independently verify if a specific commitment was recorded for a batch.
     * @param batchId Canonical 32-byte batch identifier
     * @param eventType Supply-chain stage
     * @param evidenceHash 32-byte cryptographic evidence hash
     * @return True if this exact commitment exists in the registry
     */
    function verifyCommitment(
        bytes32 batchId,
        EventType eventType,
        bytes32 evidenceHash
    ) external view returns (bool) {
        bytes32 commitmentKey = keccak256(abi.encodePacked(batchId, eventType, evidenceHash));
        return _recordedCommitments[commitmentKey];
    }
}
