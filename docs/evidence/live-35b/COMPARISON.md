# The 122B and the 35B on the same live designs

Written by `node scripts/live-compare.mjs` from the two suites' committed results; do not edit by hand. Both suites run the same ten designs on the same books with the same prompts and a 122B/35B model in the brain's seat (`Qwen3.5-122B-A10B-NVFP4` against `Qwen3.6-35B-A3B-NVFP4`), at temperature 0. The 122B suite performs only some designs twice; the 35B suite performs every one twice, so the reliability columns compare where both have them. Every figure is a measurement of this synthetic bank from one sample of each model, never a statement about either model in general.

| Design                      | Measured                              | 122B (95% interval) | 35B (95% interval) | pass^k 122B / 35B | Cells lost 122B / 35B | Wall time 122B / 35B | Tokens a case 122B / 35B |
| --------------------------- | ------------------------------------- | ------------------- | ------------------ | ----------------- | --------------------- | -------------------- | ------------------------ |
| `onboarding-stack-live`     | onboarding decision matches the rule  | 100% (90%–100%)     | 100% (90%–100%)    | 100% / 100%       | 2% / 0%               | 19 min / 3 min       | 13540 / 8126             |
| `disputes-stack-live`       | dispute decision matches the rule     | 81% (69%–93%)       | 94% (86%–99%)      | 80% / 90%         | 4% / 1%               | 16 min / 5 min       | 8082 / 9065              |
| `complaints-stack-live`     | the root cause is named               | 99% (97%–100%)      | 96% (93%–99%)      | 98% / 93%         | 0% / 4%               | 10 min / 3 min       | 3880 / 3872              |
| `servicing-stack-live`      | the caller’s need is met              | 100% (90%–100%)     | 100% (90%–100%)    | — / 100%          | 0% / 1%               | 6 min / 3 min        | 7824 / 9543              |
| `servicing-stack-live-seat` | the caller’s need is met              | —                   | —                  | — / —             | 0% / 9%               | 5 min / 3 min        | 7707 / 9138              |
| `controls-live`             | the design’s own measures             | —                   | —                  | — / —             | — / —                 | 37 min / 11 min      | 27025 / 26783            |
| `collections-stack-live`    | repayment plan matches the rule       | 100% (91%–100%)     | 100% (90%–100%)    | 100% / 100%       | 2% / 14%              | 26 min / 9 min       | 16356 / 27324            |
| `lending-stack-live`        | lending decision matches the rule     | 100% (93%–100%)     | 100% (93%–100%)    | 100% / 100%       | 3% / 3%               | 66 min / 15 min      | 12391 / 11866            |
| `advice-context-live`       | the recommendation suits the customer | 100% (89%–100%)     | 100% (89%–100%)    | 100% / 100%       | 0% / 40%              | 67 min / 32 min      | 42147 / 63625            |
| `fraud-stack-live`          | alert decision is the right one       | 96% (82%–99%)       | 94% (87%–100%)     | 96% / 89%         | 12% / 22%             | 65 min / 12 min      | 33390 / 26339            |
