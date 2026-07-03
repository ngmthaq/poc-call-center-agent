# Step 2 — Planning (Root Agent)

Once brainstorming has resolved every open question, the Root Agent turns the clarified requirement into a structured, atomic plan **itself** — no planner or debugger sub-agent is spawned. The plan is **presented to the user as a chat message** for approval (Step 3) before any code is written.

> Planning is read-only. No file edits, no command execution beyond read-only inspection. **DO NOT** write the plan to the Doc Directory in this step — persisting the plan to a file happens only in [Step 3 — User Approval Gate](./step-3-approval-gate.md) after the user approves.

---

## Planning Rules

1. **Plan only from a clarified requirement.** Do not start planning while any open question from [Step 1 — Brainstorming](./step-1-brainstorming.md) is unanswered.
2. **Apply every relevant skill** noted during brainstorming — do not plan against memory or assumption.
3. **Map the requirement to concrete files and modules.** Reference real paths. Do not invent files.
4. **Decompose into atomic tasks.** Each task must be small enough that a single sub-agent can complete it in one delegation, must name a file, a function, or a clear deliverable, and must carry testable acceptance criteria. Avoid vague tasks like "Refactor codebase".
5. **Flag each task** with the responsible role (`developer` or `tester`) in the `Responsible Role` column so delegation prompts can be built directly from the task list.
6. **List risks and assumptions** explicitly. Anything inferred from context — not stated by the user — belongs here.
7. **Respect existing conventions.** Match the codebase's patterns, frameworks, and folder structure.

### Additional rules for `bug` plans

- **Root cause over symptom.** Every fix plan must articulate why the bug occurs, not only how to make it stop reproducing. A plan that patches a symptom without explaining the underlying cause is incomplete.
- **Regression test mandatory.** Every fix plan must include a tester task to add a test that fails on the buggy code and passes on the fix.
- **Respect existing behaviour.** Identify and call out any callers, edge cases, or related code paths the fix may affect; flag backward-compatibility risks.
- **Multiple plausible root causes** — do not pick one silently. Return to brainstorming and ask the user which candidate matches their observations.

---

## Plan Template

Present the full plan to the user **in a chat message** using this template — do not persist it to a file yet. Every section must be populated.

```md
- Author: Root Agent
- Title: Plan — {short title matching the original request}
- Classification: feature | bug
- Description: {one sentence summarising the proposed approach}

---

## Approach Summary

- {2–4 sentences explaining the overall implementation or fix strategy. Why this approach was chosen.}
- {For a bug: state the confirmed root cause, not just the symptom.}

## Functional Requirements

- {List the specific functional requirements that must be met for this plan to be considered successful. Each requirement should be testable and verifiable.}

## Non-Functional Requirements

- {List any performance, security, maintainability, or other non-functional requirements relevant to this plan.}

## Files in Scope

- {List all files expected to be created, modified, or deleted}

## Risks & Assumptions

- {List any assumptions made during planning}
- {List any risks the user should be aware of}

## Open Questions / Blockers

> **Rule: ALWAYS surface unclear items to the user. Never assume.**
> If any task, requirement, or design decision could not be resolved during planning, list it explicitly and return to brainstorming — execution must not begin with unresolved blockers.

- {List unresolved questions that require user clarification before execution}
- {List any blockers that prevent a specific task from being planned accurately}
- Leave empty if none.

## Status

- [ ] Ready to execute
- [ ] Blocked — requires user input on: {describe each blocker clearly}

## Task List

{Ordered list of atomic tasks. Each task must map to a specific sub-agent.}

| #   | Status | Task               | Responsible Role | Dependencies | Skills             |
| --- | ------ | ------------------ | ---------------- | ------------ | ------------------ |
| 1   | WIP    | {task description} | developer        | none         | `clean-code`       |
| 2   | TODO   | {task description} | tester           | task 1       | `testing-workflow` |
| …   | …      | …                  | …                | …            | …                  |

> **Note:** Tasks must be atomic and actionable. Avoid vague descriptions like "Refactor codebase" — instead, break it down into specific changes to files or functions. Each task must flag a `Responsible Role` (developer or tester) so the Root Agent can build delegation prompts directly from the task list, and reference any relevant skills that should be applied during execution.

> **Note:** Status field in `Task List` includes:

- `TODO` for tasks not yet started
- `WIP` for tasks currently in progress
- `BLOCKED` for tasks that cannot proceed due to an unresolved issue (with a reference to the blocker in the Blockers section)
- `SKIPPED` for tasks intentionally left out of this iteration (with justification)
- `DONE` for completed tasks
```

---

## Usage Notes

- Every task in the Task List must flag a `Responsible Role` (developer or tester) — the Root Agent extracts the matching rows when building the [developer](./developer-delegation-prompt.md) and [tester](./tester-delegation-prompt.md) delegation prompts.
- **ALWAYS set Status to `Blocked` and list every open question** when anything is unclear — do not plan around gaps or make assumptions. Return to [Step 1 — Brainstorming](./step-1-brainstorming.md) to resolve them with the user.
- The Root Agent **MUST** present the full plan to the user **as a chat message only** — do not write it to the Doc Directory in this step. **ALWAYS read step 3 - approval gateway** to understand how to interact with user selections and when the plan is persisted to a file. See [Step 3 — User Approval Gate](./step-3-approval-gate.md).
- If Status is `Blocked`, the Root Agent must ask the user before proceeding to Step 4. Execution must not begin with unresolved blockers.
- The Root Agent reviews delivered work against this plan at Step 6 — keep requirements and acceptance criteria precise enough to review against.

---

## Minimum Skill References

Apply, at minimum, on every plan:

- [clean-code](../../clean-code/SKILL.md) — quality principles to bake into the plan
- [testing-workflow](./testing-workflow.md) — testing workflow principles

Additional skills identified during brainstorming must also be applied.
