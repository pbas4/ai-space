# AI commit labeling

Source: Realworks Confluence page [`2262270017`, “AI code labeling: what it means for your commits”](https://rwnl.atlassian.net/wiki/spaces/AIC/pages/2262270017), version 6. Verified September 15, 2026. The linked final proposal is page `2250244112`, version 5.

Apply this policy only when the user makes an explicit commit request. It does not authorize staging, committing, amending, rebasing, or squashing by itself.

## Attribution tiers

| Tier | Use when | Commit metadata |
| --- | --- | --- |
| Full AI | The agent produced the committed content and the human did not edit it. Requirements, review, and approval alone do not make the content human-authored. | AI as author, using the identity confirmed for this commit. Do not also add the same identity as a co-author. |
| AI assisted | Human and AI contributions appear in the same commit. | Keep the human author and add `Co-authored-by: Name <email>` after a blank line in the commit message. |
| Human | AI did not contribute to the committed content. Asking an agent only to run the commit command does not change this tier. | Keep the human author and add no AI trailer. |

A squash containing both AI-produced and human-produced or human-edited content is AI assisted. When ownership is ambiguous, propose AI assisted and disclose the ambiguity.

## Commit-time flow

1. Confirm that the user has made an explicit commit request and resolve the exact files intended for the commit. Do not include unrelated changes.
2. Inspect the intended diff and the known human/AI contribution history.
3. Propose one tier with a short reason and wait for the user to confirm it.
4. For Full AI or AI assisted, ask for the exact Git identity in `Name <email>` form on every commit. Do not reuse or invent an identity. If the tier is not confirmed or the identity is missing or malformed, do not commit.
5. Apply the confirmed metadata to that commit command only. Never modify local or global Git configuration and never install or edit Git hooks.
6. After committing, verify the author and complete message from Git, then report the commit identifier, confirmed tier, author, and AI trailer status. If verification does not match the confirmation, stop and report the mismatch instead of rewriting history without permission.

Urgency, deadlines, implementation approvals, or instructions to “just commit” do not replace the tier confirmation or required AI identity.

Preserve unrelated commit trailers. Amending, rebasing, or squashing remains a separate destructive or history-changing action and requires its own explicit authorization.
