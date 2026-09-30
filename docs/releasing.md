# Releasing packages

## Release policy

The four public packages use **independent versions**:

- `satteri-link-card`
- `satteri-link-mention`
- `satteri-heading-link`
- `@itoshinji/link-preview`

The repository root and Astro demo are private. No fixed or linked release groups
are configured. Changesets writes package versions and changelogs. Card and mention
use `workspace:*` for preview, which pnpm packs as the exact preview version.
A preview bump therefore also requires patch releases of its dependents; inspect
these automatic entries in the release PR. Heading remains independent.

## Everyday workflow

1. Make a feature or fix, run `vp run changeset`, select affected packages and
   their bump types, and write a short user-facing changelog entry in English.
   Commit the generated `.changeset/*.md` file in the same PR. Infrastructure,
   documentation-only, and test-only changes do not require a package release.
2. Merge that PR into `main`. The **Release PR** workflow creates or updates
   `changeset-release/main` with version changes, changelogs, and an updated
   lockfile. It never publishes. The old `release:card`, `release:mention`,
   `release:heading`, and `release:preview` bumpp commands are removed.
3. Review the release PR, including dependency-only bumps. Ensure CI passes on
   its latest head commit. With the default `GITHUB_TOKEN`, GitHub places runs
   from bot-created or bot-updated PRs in an approval-required state. A maintainer
   with write access must select **Approve workflows to run** in the release
   PR's merge-box banner after each bot update. If no run appears, closing and
   reopening the release PR is a fallback. Do not merge based on checks from an
   older head. This avoids creating
   a personal access token or installing another GitHub App. If automatic checks
   are wanted later, a separately authorized repository-scoped GitHub App is an
   alternative; no such credential is part of this setup.
4. **A maintainer merging the release PR into `main` is the publish decision.**
   The **Publish** workflow handles only a merged, same-repository PR whose head
   is exactly `changeset-release/main`. It checks out that event's merge commit,
   not whichever commit happens to be current on `main`. Ordinary feature PRs,
   branch pushes, and merging the infrastructure setup PR cannot publish.
5. The pack job runs workspace lint/type/format checks, tests, release safety
   tests, and checks tarballs for all four packages. Changesets computes the
   registry-aware publish plan and packs only missing versions, in dependency
   order. The exact artifact's contents and SHA-256 integrity are checked before
   the publish job starts. A release PR containing pending changesets fails.
6. One publish job uses npm OIDC trusted publishing and the verified artifact.
   Preview is published before card/mention. Git tags and GitHub releases are
   created using Changesets' `package-name@version` convention, including
   `@itoshinji/link-preview@version`. There is no publish matrix and no npm token.

Run locally before requesting review:

```sh
vp install --frozen-lockfile
vp run check:workspace
vp run test:workspace
vp run release:check
vp run release:pack
```

`release:pack` writes temporary tarballs, inspects them, and removes them. It does
not publish. Existing package `prepublishOnly` checks remain in place for manual
publishes, but artifact publication does not rely on lifecycle scripts to build
or test: all four packages must pass in the unprivileged pack job first.

## One-time maintainer setup

Perform these account/repository changes yourself. Do not paste credentials,
tokens, recovery codes, or private keys into issues or chat.

### GitHub

1. In [Settings → Actions → General](https://github.com/itoshimeji/satteri-links/settings/actions),
   enable **Allow GitHub Actions to create and approve pull requests**. The
   version workflow requests only `contents: write` and `pull-requests: write`;
   it does not auto-approve or auto-merge anything. If organization policy
   disables the option, the organization administrator must allow it.
2. In [Settings → Environments](https://github.com/itoshimeji/satteri-links/settings/environments),
   create an environment named **`npm`**, restrict deployment branches to
   **`main`**, and, if available for the repository's plan, add required
   maintainer reviewers for an additional publish approval. Configure the
   protection before merging the first release PR. The YAML environment name
   alone does not establish reviewer protection. This workflow requests OIDC
   only in the publish job; the build/test job has read-only repository access.
3. Keep existing branch protection and required checks. Approve the latest-head
   bot release PR workflow runs as described above when using the default token; do not
   bypass a required check. There are no `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or
   custom GitHub token secrets to add.

### npm

Sign in with an account that owns or maintains all four packages and has 2FA
enabled. For **each** package, open its settings and add a GitHub Actions
Trusted Publisher:

| Field                | Value                                  |
| -------------------- | -------------------------------------- |
| Organization or user | `itoshimeji`                           |
| Repository           | `satteri-links`                        |
| Workflow filename    | `publish.yml` (filename only, no path) |
| Environment name     | `npm`                                  |
| Allowed actions      | Enable direct **`npm publish`**        |

Package settings:

- [satteri-link-card](https://www.npmjs.com/package/satteri-link-card/access)
- [satteri-link-mention](https://www.npmjs.com/package/satteri-link-mention/access)
- [satteri-heading-link](https://www.npmjs.com/package/satteri-heading-link/access)
- [@itoshinji/link-preview](https://www.npmjs.com/package/@itoshinji/link-preview/access)

New npm trusted publisher configurations default to stage-only permissions.
Changesets v3 currently **does not support npm staged publishing**. This workflow
directly publishes after the human release-PR merge, so stage-only permissions
will fail. Explicitly permit `npm publish`; do not substitute a long-lived token
to work around that failure. A stage-only flow would require a different workflow
and a second human approval on npm.

Use GitHub-hosted runners, as specified here. The workflow pins pnpm 11.18.0
through the existing `devEngines` configuration; its native publish implementation
supports trusted publishing. After Vite+ installs dependencies, the shared
`setup-release-pnpm` action reads that same pin and uses `pnpm/action-setup` to put
pnpm on the child-process PATH in CI and every Changesets job. Vite+'s internal
package-manager runner alone does not make pnpm available to Changesets, which
spawns it directly. A version probe rejects missing or mismatched executables;
release regression tests run the real `publish-plan` command against a local
fixture registry and reproduce the missing-PATH failure without publishing.
Changesets' own formatter is disabled because Vite+'s `oxfmt` wrapper supports
IDE integration only; command-line formatting uses `vp fmt`. The `release:version`
script formats generated changelogs and manifests with `vp fmt` after updating
the lockfile.
`PNPM_CONFIG_PROVENANCE=true` requests provenance for public package publication.
Node 24 is used for release jobs. No authentication is needed for installing the
public dependencies.

If a package does not yet exist or your account lacks its settings, handle its
initial npm package ownership/bootstrap manually before the first automated
release. Do not assume configuring one sibling grants permission for another.
In particular, the npm scope `@itoshinji` differs from the GitHub owner
`itoshimeji`. Confirm scope permissions separately. Never enable OIDC permissions
for the demo or repository root.

After successful trusted publication, npm recommends **Require two-factor
authentication and disallow tokens** in the package's Publishing access settings.
This optional security change is a separate maintainer action. OIDC remains
supported; no token bypass is required.

## Failures and retries

- If version PR creation is forbidden, check the Actions setting and repository
  rules. Do not weaken branch protection or create credentials just to retry.
- If Changesets reports `spawn pnpm ENOENT`, verify the shared pnpm setup runs
  after Vite+ setup and before Changesets in that job. A passing build or
  `vp install` does not prove that Changesets child processes can find pnpm.
- If checks fail, fix the cause in a normal PR and update the release PR. Run CI
  on its new head before merging.
- If publishing fails, inspect the workflow logs and correct publisher fields,
  `npm` environment restrictions, scope ownership, or allowed actions. **Re-run
  all jobs** on the original merged-release run after resolving the cause. This
  regenerates the publish plan against the registry; already published immutable
  versions are not published again. Do not rerun only the publish job with a stale
  plan or change package versions merely to retry authentication.
- A multi-package npm release is not atomic. A failure can leave preview live
  while a dependent remains unpublished. Check all package versions and GitHub
  releases after a retry; a failure after npm publication can also require a
  maintainer to repair missing Git tags/releases manually. Never unpublish or
  overwrite an already-published version as part of a retry.
- Do not rename `publish.yml` or the `npm` environment without updating each
  package's trusted publisher. OIDC authorization cannot be fully tested using
  PR CI or `--dry-run`; verify it on the first explicitly approved real release.

## References

- [Changesets automation and its staged-publishing limitation](https://changesets.dev/guide/automating)
- [Changesets CLI: version, pack, publish](https://changesets.dev/guide/cli)
- [Changesets action v2.1.2](https://github.com/changesets/action/tree/v2.1.2)
- [npm trusted publisher setup and allowed actions](https://docs.npmjs.com/trusted-publishers/)
- [pnpm 11 native publishing](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/11.0.md)
- [GitHub workflow triggering and default-token restrictions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
