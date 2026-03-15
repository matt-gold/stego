# TODOs

## Named output profiles / multi-output export identities

- What: Add explicit output identities so one project can intentionally ship more than one artifact for the same target, such as two different DOCX outputs.
- Why: The new advanced template mode can auto-discover multiple templates, but `stego export --format <target>` still resolves only one output or errors on ambiguity.
- Pros: Unlocks deliberate multi-output publishing flows without relying on naming accidents or manual `--template` selection.
- Cons: Adds new CLI and docs surface area around profile naming, output selection, and artifact defaults.
- Context: The current implementation intentionally keeps `build` broad and `export` singular. If advanced projects need `print.docx` and `submission.docx`, this is the next product step.
- Depends on / blocked by: Depends on the target-aware discovery/planner landing first so profiles can layer on top of the planner instead of replacing it.

## Explicit advanced markdown override

- What: Allow advanced projects to define a dedicated markdown/debug template instead of always using the deterministic default markdown path.
- Why: Markdown is currently a special-case export artifact, which keeps the default lane simple, but some advanced projects may want a custom markdown handoff or debug artifact.
- Pros: Gives advanced projects a controlled escape hatch without weakening the default markdown contract for everyone else.
- Cons: Adds another selection rule and risks muddying the “markdown is a special-case export artifact” story if introduced too early.
- Context: The current implementation keeps markdown outside the strict target-aware typing contract and routes it through the default template path on purpose.
- Depends on / blocked by: Depends on the advanced target-aware discovery rules and future profile/output identity design being stable enough to add another explicit output lane.

## Persistent cross-command template cache

- What: Add a persistent cache so repeated `build` / `export` runs do not rebundle and reload the same templates every time.
- Why: The first version only caches discovered templates in memory per command, which is enough for correctness and obvious duplicate-work removal, but not for longer authoring sessions.
- Pros: Improves repeated command latency once advanced projects have several templates or heavier template dependency graphs.
- Cons: Introduces cache invalidation and staleness concerns, which would add complexity to the first version if done now.
- Context: The current implementation compiles each discovered template once per command and shares that result within the planner. Cross-command reuse is explicitly deferred.
- Depends on / blocked by: Depends on having real-world evidence that template discovery/bundling is a noticeable bottleneck after the advanced lane ships.
