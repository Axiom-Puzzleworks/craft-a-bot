# The contract suite — findings (2026-10-10)

The 35B (`fast-pair`), two performances per item, over three desks, comparing the reply contract's three overrides (`none`, `say`, `retry-with-nudge`; plan 114 WP205) for a reply that is prose with no call. Replayed exactly by `scripts/live-check.mjs --suite contract`. All three read *inconclusive* in the register.

- **Advice** (11 items a side): suitable 100% / 95.5% / 100%, minimised 100% throughout. `say` cost one item (−4.5, interval −14.7 to +5.6).
- **Collections** (36–37 items): plan matches the rule 98.6% / 98.6% / 100%; vulnerability actioned 100% throughout.
- **Fraud** (27 items): no tip-off in any cell; alert decision 87.0% (none), 94.4% (`say`), 83.3% (`retry-with-nudge`) — differences of 3–7 points, intervals spanning zero, p ≥ 0.25.

**Reading.** The contract is a mechanism with a demonstrated effect on a prose reply (`session/reply-contract.test.ts` and the mechanism demo in `docs/evidence/reply-contract/`), but on these three desks the 35B rarely answered in prose, so there was almost nothing for it to act on and no override moved a metric by an amount these samples can see. This neither supports nor undermines the contract; a model that answers in prose more often, or a longer book, is what would test it.
