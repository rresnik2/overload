# DIAL-gear-1: regenerate signature blocks

**What:** run `pnpm docs:sync`. The signature blocks in `CONTRACTS.md`, `docs/agents/E1.md` and `docs/agents/E2.md` are stale because `MachineProfile` gained `equipment` (fields schema) and `repo.machineProfiles.gear(...)` was added.

**Why:** `scripts/docs.test.ts` ("every signature block ... matches the source") fails in `pnpm check` until the docs are regenerated. docs:sync is coordinator-only.

**Workaround:** none needed; this is the only failing test in `pnpm check`.
