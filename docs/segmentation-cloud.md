# Cloud segmentation lab

The cloud segmentation lab adds a private, authorized-user path at
`/segmentation-lab/`. The browser uploads an image to the Worker, the Worker
creates a GitHub Actions task, and the one-shot runner calls the existing
segmentation service. Candidates, the WebP preview, and calibration records
remain behind the Worker until its owner explicitly publishes a
calibration to the Cloudflare site.

This is an additional path. The local lab keeps its existing data directory,
commands, models, three publish targets, calibration editor, SVG export, and
SAM3 availability behavior. Existing local commands in
[`tools/segmentation-lab/README.md`](../tools/segmentation-lab/README.md) do
not change. Cloud experiments and local experiments are separate datasets and
are not synchronized.

## Accounts and lab authorization

The cloud lab shares the Cloudflare Web account and same-origin HttpOnly session
at `/segmentation-lab/`; it has no separate registration or login. Web API requests
also use the current origin. Users previously signed in only on the `api` subdomain
may need to sign in once again on the main site after this change.

Administrators always have lab access. Other accounts start without it. In
**我的 → 管理中心 → 用户**, an administrator can select **开通实验台权限** or
**撤销实验台权限** for a regular account. Granted users are displayed as **创作者**,
while their account role remains `user`. This grant includes computation,
calibration, export and explicit public publication of their own results; it does
not grant user management or general administrator wall-authoring permissions.
Refresh **我的** after a grant to see **分割实验台**, then enter without logging in again.

Permissions are read from the database on each API request. Revocation blocks the
next lab request even with an existing session, including reads and publication.
Experiment data and previously published walls remain intact; an already queued
or running machine task may finish, but does not publish automatically. Restoring
the grant restores access to the user's retained experiments. Experimental data
remains isolated by owner, including between administrators.

Apply `edge/migrations/0010_lab_access.sql` to the target D1 database before deploying
the updated Worker. It adds `admins.lab_enabled` with a default of `0`, preserving
existing accounts and administrator access. Normal D1 migration commands are in
[the deployment guide](./cloudflare-edge-deployment.md). Local FastAPI exposes the same grant-management capability for its independent local accounts; grants and experiment data are not synchronized between deployments.

## Prerequisites

The Worker must have its D1 and private R2 `MEDIA` bindings configured. The
GitHub repository must contain
[`.github/workflows/segmentation-lab.yml`](../.github/workflows/segmentation-lab.yml)
on its default branch. GitHub only exposes a `workflow_dispatch` workflow from
the default branch until that workflow has been registered there. After it is
registered, `LAB_GITHUB_REF` may point at a feature branch or other ref for
verification; the workflow file on that ref must contain the same dispatch
inputs.

The cloud path currently supports `sam2` and `sam2_tiled` on Ubuntu 24.04,
Python 3.11, CPU PyTorch, and four CPU threads. The Actions job has a 90-minute
timeout. A queued task expires after 30 minutes and a claimed task after 120
minutes. Each authorized user may have at most two queued or running tasks.
Images are JPEG or PNG, at most 20 MiB, at most 4096 pixels on either side,
and at most 16,777,216 pixels. Parameters are allowlisted: point density
8–64, batch size 1–8, quality and stability thresholds 0–1, and crop layers
fixed at 0.

## Configure the Worker and Actions

Use a single newly generated random value for `LAB_RUNNER_KEY` in both places:
the Worker secret and the repository Actions secret. Do not put the value in a
file, command history, logs, or a browser bundle.

The Worker needs these server-side settings:

| Setting | Value |
| --- | --- |
| `LAB_GITHUB_TOKEN` | A GitHub fine-grained personal access token scoped to this repository with Actions write permission, used only to dispatch the workflow. |
| `LAB_GITHUB_REPOSITORY` | The `owner/repository` name containing the workflow. |
| `LAB_GITHUB_REF` | The branch or ref to dispatch after the workflow is registered on the default branch. |
| `LAB_GITHUB_WORKFLOW` | `segmentation-lab.yml` unless the workflow file is deliberately renamed. |
| `LAB_RUNNER_KEY` | The same random runner key configured as a repository secret. |

Set Worker secrets with the project Wrangler configuration:

```bash
npx wrangler secret put LAB_GITHUB_TOKEN --config edge/wrangler.jsonc
npx wrangler secret put LAB_RUNNER_KEY --config edge/wrangler.jsonc
```

Set repository secrets interactively with GitHub CLI. These commands prompt for
each value, so the values are not printed in the command itself:

```bash
gh secret set LAB_API_URL
gh secret set LAB_RUNNER_KEY
```

`LAB_API_URL` must be the deployed Worker API prefix, ending in
`/api/v1/segmentation-lab`. `LAB_RUNNER_KEY` must exactly match the Worker
secret. The workflow passes the task and attempt identifiers as
`workflow_dispatch` inputs and derives its run identifier from GitHub's run
metadata. It does not receive a bucket-wide credential.

The fine-grained token should be limited to the target repository and granted
the minimum Actions permission needed to dispatch workflows. Never paste a
token, runner key, API URL containing credentials, or secret output into this
document or into a shell transcript.

After changing the workflow or its dependencies, register the workflow on the
default branch first. Once that is done, set `LAB_GITHUB_REF` to the feature
ref when verifying that version. A dispatch failure is stored as a failed task
with a retryable reason; it does not expose GitHub's response body.

## Runner behavior

The workflow installs the cloud-only dependency extra and runs one claimed task
per job:

```bash
cd tools/segmentation-lab
uv sync --locked --extra sam2
uv run --no-sync python -m segmentation_lab.cloud_runner
```

The runner reads `LAB_API_URL`, `LAB_RUNNER_KEY`, `LAB_TASK_ID`,
`LAB_ATTEMPT_ID`, and `LAB_RUN_ID` from the workflow environment. It claims the
task, downloads and verifies the input and metadata, runs the existing
`BenchmarkService`, then uploads exactly `candidates.json`, `display.webp`,
and `masks.zip` before reporting success. A rejected claim exits without
marking another runner's task failed.

The `sam2` extra is for the cloud workflow; the existing local `models` extra
and local setup remain available. Model downloads use the pinned revision in
the workflow and may be slow on a cold cache. Cache entries contain model files,
not experiment images, task credentials, or results.

## Status, retries, and storage

Tasks move through `queued`, `running`, `succeeded`, `failed`, and
`timed_out`. A timeout or runner failure cannot be resumed by a late upload or
callback. Retrying creates a new task and attempt, leaving the old task and its
diagnostic state available; use the lab's retry action rather than manually
dispatching the same identifiers.

Input images and task outputs use private `lab/` R2 keys and are served only by
authenticated Worker endpoints. Saving a calibration copies its candidates and
display image into a calibration-specific prefix, so deleting the source run
does not remove a saved calibration. Publishing copies the selected display
image and calibration-derived public assets into the independent public media
objects used by the wall. Deleting the experiment later does not remove an
already published wall, and deleting a run does not destroy a saved
calibration. These copies are intentional and are not automatic synchronization
between local and cloud storage.

## Publish and rollback

Inference never publishes a wall automatically. An authorized user saves a
calibration, reviews it in the existing editor, and explicitly chooses the
Cloudflare publish action. The browser never receives the publish signing key.
If a cloud task is unhealthy, let it reach its timeout or delete it, then retry
as a new task after correcting the configuration. If dispatch configuration
must be withdrawn, remove or rotate the Worker and repository secrets and leave
the existing local lab enabled; local operation and previously published walls
are independent of the cloud task queue.

Remote model runs and production deployment are environment-dependent. This
document describes the configured workflow and setup; it is not a claim that a
repository workflow, Worker, or model run has been deployed or verified.

The production deployment and four successful remote runs on 2026-09-11 are
recorded separately in [the verification report](benchmarks/2026-09-11-segmentation-cloud-verification.md),
including CPU memory measurements and browser calibration/publication checks.
