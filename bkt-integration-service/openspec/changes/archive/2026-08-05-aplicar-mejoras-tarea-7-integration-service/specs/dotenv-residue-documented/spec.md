## ADDED Requirements

### Requirement: Dead env vars documented as residue
The system SHALL document `TENANT_ID`, `PROJECT_ID` and `ITSM_ID` as dead residue not used by the operational flow.

#### Scenario: Residue documented without modification
- **WHEN** the change documentation describes the `.env` residue
- **THEN** the vars are listed as dead residue and the real `.env` file is NOT modified

### Requirement: New code uses meshId only
The system SHALL NOT reintroduce `tenantId`, `projectId` or `itsmId` in the operational flow, new models, contracts or active documentation.

#### Scenario: No tenant/project/itsm identifiers in new flow
- **WHEN** new code or documentation references multi-tenant context
- **THEN** it uses `meshId` / `MESH_ID` only
