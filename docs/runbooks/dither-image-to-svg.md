# Runbook — Dither an image to SVG

Take a source image, dither it to SVG, crop and clean it, and put it into an
app under `apps/<name>/public/`. Golf is one example. This works for any app in
the repo.

## Prerequisites

- A source image (JPEG or PNG).
- Access to Dither it! at https://ditherit.com.
- This repo checked out, with `pnpm install` done.

## Steps

1. Open Dither it! in a browser.
2. Load the source image.
3. Set the output to SVG.
4. Download the SVG file.
5. Pick a target app. For example, `apps/golf`.
6. Make a work folder at the app root:
   ```
   mkdir -p apps/<name>/dither/in
   ```
7. Move the downloaded SVG into `apps/<name>/dither/in/`. Use a clear name.
8. Run the process script:
   ```
   ./scripts/dither-svg/index.ts apps/<name>/dither/in
   ```
   This writes cleaned SVGs into the app `public/` folder by default.
9. Check each output file in `apps/<name>/public/`.
10. Reference the SVG from app code as a normal public asset.
11. If you need runtime color control, use the SVG as a CSS mask:
    ```css
    .art {
      background-color: green;
      -webkit-mask: url("/thing.svg") center / contain no-repeat;
      mask: url("/thing.svg") center / contain no-repeat;
    }
    ```
12. Keep `apps/<name>/dither/in/` only if you want the source exports for later re-runs.

## What the script does

- Reads each SVG in the input folder.
- Drops every black `<rect>`.
- Merges the remaining white pixels into path segments.
- Finds the bounds of the white artwork.
- Rewrites the root `viewBox` to that bound.
- Removes `width`, `height`, and `fill` from the root `<svg>`.
- Writes the result to the app `public/` folder by default.

## Verification

- Open one output SVG in a browser.
- Confirm the artwork fills the viewBox with no black border.
- If you use it inline, confirm `fill` responds to your CSS rule.
- If you use it as an external asset, confirm the CSS mask renders with the expected color.

## If the script reports "no white artwork found"

- The input SVG has no white rects.
- Check the Dither it! export settings.
- Re-export the SVG.

## If a file takes too long

- Large source images make large SVGs.
- Use a smaller source image.
- Re-export from Dither it! at a lower resolution.
