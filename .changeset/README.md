# Changesets

For changes that should reach npm, run `vp run changeset` and commit the generated
Markdown file with the feature or fix. Choose only the affected public packages
and write a user-facing summary in English. Documentation, tests, and release
infrastructure alone do not need a version bump.

The four packages have independent versions. A preview release also patch-bumps
card and mention because their `workspace:*` dependency becomes an exact version
in a published tarball. Heading is unaffected unless selected explicitly.

See [the release guide](../docs/releasing.md) for the review, authentication setup,
and publishing process. Do not run publish locally as part of ordinary development.
