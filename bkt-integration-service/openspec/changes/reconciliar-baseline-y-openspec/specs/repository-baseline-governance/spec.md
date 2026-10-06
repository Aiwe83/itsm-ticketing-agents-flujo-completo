## ADDED Requirements

### Requirement: Maintain an explicit repository baseline inventory
The project MUST classify candidate repository paths before creating its initial baseline and MUST exclude secrets, local environments, temporary files, logs, coverage, build outputs, dependencies, and regenerable artifacts unless an explicit exception is documented.

#### Scenario: Initial baseline is prepared
- **WHEN** the repository has no prior commit
- **THEN** an explicit reviewed inventory identifies the files allowed into the baseline
- **AND** no bulk staging operation is used as the review mechanism

### Requirement: Keep test credentials outside version control
The project MUST NOT version `.env.test` when it contains real or reusable credentials and MUST provide only fictitious example values in versioned environment templates.

#### Scenario: Test environment is reviewed
- **WHEN** environment files are classified for the baseline
- **THEN** credential-bearing test files remain local
- **AND** versioned examples contain no usable secret

### Requirement: Reconcile OpenSpec tasks with evidence
Every completed implementation task in `jira-attachment-processing-hardening` MUST have concrete evidence in code, automated tests, or a reproducible validation command. A task without evidence MUST remain incomplete.

#### Scenario: Pending attachment task is audited
- **WHEN** a task is compared with the current repository
- **THEN** it is classified as implemented and tested, implemented without test, not implemented, or no longer applicable
- **AND** it is marked complete only after all required evidence exists

### Requirement: Keep mapping documentation paths portable
Mapping context directories MUST use short stable aliases that work with Windows and Git, while the full tenant, project, and ITSM identifiers MUST remain inside the structured catalog files.

#### Scenario: Long context path is migrated
- **WHEN** a context directory exceeds the supported tool path length
- **THEN** it is renamed to a short alias
- **AND** all relative references are updated without losing context identifiers

### Requirement: Generate scoped technical documentation
Generated technical documentation MUST be produced only from the service source, mapping documentation, and OpenSpec artifacts. It MUST exclude unrelated project context, dependencies, coverage, builds, logs, and previous generated output.

#### Scenario: Architecture documentation is regenerated
- **WHEN** architecture documentation is regenerated for this repository
- **THEN** every source root belongs to `src`, `docs/mappings`, or `openspec`
- **AND** the report declares its scope and generation date

### Requirement: Preserve a review gate before Git publication
This change MUST NOT create or publish the initial commit automatically. The candidate baseline MUST be reviewed for sensitive data and explicitly authorized before commit or push.

#### Scenario: Baseline preparation finishes
- **WHEN** inventory, exclusions, links, tasks, and documentation checks pass
- **THEN** the repository remains ready for a separate commit authorization
- **AND** no remote publication has occurred
