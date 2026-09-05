# Migrations

The compatibility policy is `docs/design-day2/14-BRICK-REFERENCE-DESIGNS.md` §7: additive changes never bump a format version; a breaking change bumps it with a migration and a fixture, and a breaking change to `@craftabot/core`'s interfaces takes its major version (`01-ARCHITECTURE.md` §5). This file is where each of those is written down for someone upgrading.

## `@craftabot/core` 0.0.1 → 1.0.0 (2026-09-05, WP56)

**Removed: `PackManifest.guardrails`.** The lane was deprecated at WP39 (`29-GUARD-SHELL.md` §4.3) because nothing ever read it but the registry's own insert, and `PackRegistry.getGuardrail` went with it. `createPackRegistry().registerPack` now refuses a manifest that still carries the key, by name, so an old pack fails at registration rather than registering with its rules silently dropped.

Where a pack's guardrails go instead — all three existed before the removal:

- **A brick kind's `contributeGuardrails`** — the rule travels with the brick that fits it (`14-…` §2).
- **A policy card** (`PackManifest.policyCards`) — declarative, data, compiled by `@craftabot/governance`'s `compilePolicyCard` (`14-…` §4.6).
- **A guardrail service** (`PackManifest.guardrailServices`) — a hosted verdict behind the `GuardrailService` contract, turned into guardrails by `createHostedGuardrails` (`29-…` §4.3).

`GuardrailDefinition` stays exported as a type: pack code still describes a rule that way and builds a `Guardrail` from it with `create()`; it is simply no longer something a manifest lists.

**Version ranges.** Every shipped pack declares `requiresCore: '>=0.0.1'`, which `1.0.0` satisfies; a kit file's `requires.core` is evaluated on import (WP52), so a kit exported with `>=0.0.1 <1.0.0` will be refused with a `version-mismatch` naming the range — re-export it from a host on 1.0.0. A test in `packages/core` holds `CRAFTABOT_CORE_VERSION` and `package.json` to one number; another imports every shipped kit-file fixture at that version.
