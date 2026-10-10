# The test programme

The fourteen questions of `docs/design-day2/112-REAL-ENOUGH-PLAN.md` §9, one file each (plan 114 WP213). A status is `not-run`, `partly-run` or `run`, and a test that has been run names the committed results it rests on; `packages/harness/src/tests-programme.test.ts` refuses a status the evidence does not carry. The answers are about this synthetic bank and transfer as method and shape, never as magnitude.

| Test            | Question                                                                     | Status         | Evidence                                                                 |
| --------------- | ---------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| [T01](T01.json) | Where should the person sit?                                                 | **partly-run** | `human-oversight`, `lending-oversight-live`, `complaints-oversight-live` |
| [T02](T02.json) | Does a person at an approval help, or rubber-stamp?                          | **partly-run** | `gate-presets`, `lending-oversight-live`                                 |
| [T03](T03.json) | Which guard, where, for what?                                                | **partly-run** | `disputes-stack-live`, `fraud-stack-live`, `lending-stack-live`          |
| [T04](T04.json) | Does a decision check beat a sequence check?                                 | **not-run**    | —                                                                        |
| [T05](T05.json) | Block, escalate or annotate?                                                 | **not-run**    | —                                                                        |
| [T06](T06.json) | Can an agent be trusted to send money?                                       | **not-run**    | —                                                                        |
| [T07](T07.json) | Does the agent stay with its customer?                                       | **not-run**    | —                                                                        |
| [T08](T08.json) | What does delegation cost in trust?                                          | **not-run**    | —                                                                        |
| [T09](T09.json) | Is the bias in the model or in the control?                                  | **partly-run** | `lending-fairness`                                                       |
| [T10](T10.json) | Does the monitor see the drift before the register does?                     | **not-run**    | —                                                                        |
| [T11](T11.json) | What does the Gate cost, and what does it catch, on a wire that is not ours? | **not-run**    | —                                                                        |
| [T12](T12.json) | How much of the bank can one person run?                                     | **not-run**    | —                                                                        |
| [T13](T13.json) | Which vendor, for which attack, at what price?                               | **not-run**    | —                                                                        |
| [T14](T14.json) | Does the model a bank can run inside its boundary do what the frontier does? | **partly-run** | `lending-stack-live`                                                     |
