# Art Almanac

One artwork a day for K-12 students: grade-level descriptions (K to 12) and discussion questions in 15 categories. Static site, no runtime dependencies, no accounts, no paid services.

## Run it on your computer
Needs Node 20+ (https://nodejs.org).

    node scripts/serve.mjs        # then open http://localhost:3000

## What is in here
- `public/` is the whole website. `public/data/artworks/MM-DD.json` is one artwork per calendar day (366 files, `02-29` is the leap-day artwork).
- `public/config.json` sets the default time zone (now Asia/Shanghai).
- `scripts/validate.mjs` checks the data. `scripts/build-index.mjs` rebuilds `public/data/index.json` (run it after editing any artwork file).
- `CONTENT_GUIDE.md` explains how to add or change an artwork.

## Downloading the arthistoryproject.com images (recommended)
64 artworks use images from arthistoryproject.com. Run `node scripts/fetch-images.mjs` once on your own computer. It saves them into `public/images` so the site no longer depends on that website. Then run `node scripts/build-index.mjs`.

## Adding your own images (2 artworks need one)
`node scripts/validate.mjs` lists the artworks showing "Image coming soon". For each:
1. Put your image in `public/images/` (for example `public/images/09-02.jpg`).
2. Open that day's file in `public/data/artworks/` and replace `"image": { "status": "pending" }` with:

        "image": {
          "url": "/images/09-02.jpg",
          "credit": "Who made / owns the photo",
          "license": "Exactly what permits you to use it"
        }

3. Run `node scripts/build-index.mjs`, then check the page.
Only use images you have the right to use. Do not copy images from sites whose terms forbid it.

## Before real classroom use
- Every artwork is marked `metadata-screened`: its subject was checked from museum records, but **nobody has looked at the image yet**. A person should view each image and then change `safety.status` to `approved`.
- Facts and object IDs were read from the Met's Collection API. Spot-check a sample against https://www.metmuseum.org.
- `node scripts/validate.mjs --strict` only passes once all images are linked and reviewed.

## Put it online with Vercel (free)
1. Create a free account at https://github.com and upload this folder as a new repository.
2. Create a free account at https://vercel.com, choose "Add New Project", import the repository, leave all settings as they are, and press Deploy.
`vercel.json` already tells Vercel to publish the `public` folder with no build step.

## Tests
    node --test tests/*.test.mjs

## Known limits
Built as a static TypeScript site rather than Next.js. Source is in `src/`; compiled files are committed in `public/js/`, so no build is needed to deploy. Editing `src/` needs TypeScript (`npx tsc -p tsconfig.json`).
