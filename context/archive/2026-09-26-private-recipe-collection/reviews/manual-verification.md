# Manual verification — private recipe collection

- Recorded: 2026-09-27
- Source: user confirmation during F1 triage in this conversation.
- Evidence type: tester-reported results; not an independent browser rerun by the review agent.

| Plan item | Confirmed result                                                                                                                 | Reported test date |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1.5       | PASS — two separate sessions retain their own identity; signout denies access after direct navigation and Back/reload.           | 2026-09-27         |
| 1.6       | PASS — forced session refresh renews cookies; subsequent signout denies access.                                                  | 2026-09-27         |
| 2.4       | PASS — Chrome and Firefox at desktop/mobile widths; collection screen, keyboard access and long email without overflow.          | 2026-09-27         |
| 2.5       | PASS — completed collection retains account on reload, isolates accounts and denies access after signout, including Back/reload. | 2026-09-27         |

The user confirmed all four checks passed and reported no exceptions. Browser versions, exact viewport sizes and tested commit were not supplied.

This confirmation resolves F1's missing written manual-results record. It does not add an independent browser verification or change the plan's Progress checkboxes.
