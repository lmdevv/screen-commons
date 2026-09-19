# Two-week MVP validation plan

## Decision to make

Determine whether complete, ordered UI flows help designers or developers during real work and
whether people will contribute acceptable flows despite mandatory registration.

Continue beyond the MVP only when all of these are credible:

- at least 5 of 15 invitees use Open UI successfully during a real task;
- at least 2 invitees submit an acceptable flow;
- participants can find a useful reference without navigation guidance; and
- most invitees do not abandon at registration.

## Cohort and protocol

Recruit 15 designers and developers who expect to need interface references during the test window.
Record role and relevant experience, not unnecessary personal data. Use the same neutral invitation:

> Open UI is a free library of complete interface flows. Please create a free account and use it
> during one real design or development task in the next two weeks. Explore it as you naturally
> would. If you can, submit one complete web flow you consider useful. We are testing the product,
> not you.

Do not explain the navigation, prescribe search terms, identify the best seed content, or walk a
participant through contribution. Product outages may receive technical support, recorded in the
incident log, without coaching the task.

## Evidence record

For each participant record a pseudonymous participant ID, invitation time, landing, sign-up start,
sign-up completion, first library activity, real-task attempt, useful reference found unaided,
search/browse path, contribution attempt, acceptable submission outcome, abandonment reason, and
brief qualitative feedback. Separate maintainer/test events from cohort events.

An acceptable flow has coherent start/end intent, correct ordering, useful product/platform/source/
capture/version metadata, no exposed personal information or secrets, valid rights status, and
screens that meet the image rules.

## Test control

Record the release version and exact start/end times. During the two weeks, fix only security,
data-loss, outage, or task-blocking defects. Do not add mobile collections, semantic search, API,
CLI, MCP, browser capture, datasets, or monetization. Log every incident and its participant impact.

## Decision report

At the endpoint freeze the evidence and report the complete funnel: invited, landed, started
registration, registered, attempted a task, found a useful reference unaided, attempted contribution,
and submitted an acceptable flow. Include corpus gaps, misleading metrics, moderation burden,
operating cost, and maintainer effort.

Choose exactly one outcome: continue toward a new evidence-driven V1 project, narrow and retest,
retain as a portfolio/personal tool, or stop/freeze contributions. Deferred features do not become
active merely because the MVP shipped.
