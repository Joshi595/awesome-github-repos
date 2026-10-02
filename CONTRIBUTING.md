# Contributing

## Setup

The project needs Node.js 22 or newer. If you already have it, `npm install` is all you need.

To keep everything inside the project folder instead, create a `venv_github` environment that holds its own copy of Node and npm (this needs Python 3.7+):

```sh
python -m venv venv_github
venv_github/Scripts/python -m pip install nodeenv         # bin/ instead of Scripts/ on macOS and Linux
venv_github/Scripts/python -m nodeenv -p --prebuilt --node=lts
```

Then activate it in each new terminal before running npm:

```sh
venv_github\Scripts\Activate.ps1      # PowerShell
source venv_github/bin/activate       # macOS and Linux
npm install
```

`venv_github/` and `node_modules/` are git-ignored.

## Everyday commands

| Command                              | What it does                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `npm run data:sample`                | Build a snapshot from `fixtures/sample-raw.json`. No network.                                                 |
| `npm run data:fetch`                 | Fetch live data from GitHub, then build the snapshot. Set `GITHUB_TOKEN` to make it about three times faster. |
| `npm run data:pull -- --url <site>`  | Download the snapshot a deployed site is serving.                                                             |
| `npm run dev`                        | Start the site at http://localhost:4321.                                                                      |
| `npm test`                           | Run the unit tests.                                                                                           |
| `npm run lint` / `npm run typecheck` | Static checks. Both must pass in CI.                                                                          |
| `npm run build`                      | Build the static site into `apps/web/dist`.                                                                   |
| `npm run pipeline -- help`           | List every pipeline command and option.                                                                       |

The site needs a snapshot at `data/site/snapshot.json` before `dev` or `build` will work; either data command creates it.

`data:fetch` without `GITHUB_TOKEN` still works, but it cannot look up releases and the issue / pull request split, so those show as "Not checked".

## Browser tests

The end-to-end tests drive a real browser against the built site, using the bundled sample so the results are the same every time:

```sh
npm run data:sample
npm run build
npm run e2e
```

Playwright needs a browser. Either download its own once with `npx playwright install chromium`, or point it at one you already have:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run e2e              # macOS and Linux
$env:PLAYWRIGHT_CHANNEL = 'chrome'; npm run e2e    # PowerShell
```

Tests live in `e2e/`. They assert on the sample data, so if you regenerate the fixture (`npm run pipeline -- fixture`) expect to update a few names.

## Adding a collection

Create `content/collections/<id>.yaml`:

```yaml
id: rust-cli-essentials
title: Rust CLI Essentials
audience: Builders
description: One line on who this is for and what it gets them.
last_reviewed: '2026-10-02'
repositories:
  - name: BurntSushi/ripgrep
    note: Why this one earns its place, in a sentence.
```

Every repository must have 10,000+ stars to be in the dataset. If one is renamed or drops out later, the build prints a warning and leaves it out instead of failing. Run `npm run data:sample` or `npm run data:fetch` and check the output for warnings.

## Changing how domains are assigned

Domains come from `content/taxonomy.json`. Each domain lists:

- `topics`: GitHub topics that are strong evidence (3 points each).
- `keywords`: whole words or phrases looked for in the name and description (2 points each).
- `languages`: weak evidence (1 point) that can tip a tie but never assigns a domain alone.

A repository needs 2 points to enter a domain. The scoring lives in `packages/pipeline/src/transform/classify.ts`, with cases in `packages/pipeline/tests/transform.test.ts`. After editing the taxonomy, rebuild the data and look at the "unclassified" count the build prints, then add a test for any repository you were trying to fix.

## Where things go

- A change to the shape of the data starts in `packages/schema`. The pipeline and the site both read their types from there.
- Browser code must import `@agr/schema/site-index` (or types only from `@agr/schema`). Importing values from `@agr/schema` pulls the validation library into the client bundle.
- Filtering, search, URL state and shortlist logic are pure functions in `apps/web/src/lib` and are unit-tested. Keep new logic there, not in components.
- `README.md`'s statistics and top list, and everything in `lists/`, are generated. Edit the generator in `packages/pipeline/src/export/markdown.ts`, not the output.
