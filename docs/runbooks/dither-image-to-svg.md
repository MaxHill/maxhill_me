# Runbook — Dither an image to SVG

Take a source image, dither it to SVG, crop and clean it, and put it into an
app under `apps/<name>/src/`. Golf is one example. This works for any app in
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
   mkdir -p apps/<name>/dither/in apps/<name>/dither/out
   ```
7. Move the downloaded SVG into `apps/<name>/dither/in/`. Use a clear name.
8. Run the process script:
   ```
   ./scripts/dither-svg/index.ts apps/<name>/dither/in apps/<name>/dither/out
   ```
9. Check each output file in `apps/<name>/dither/out/`.
10. Move each cleaned SVG into `apps/<name>/src/`.
11. Delete `apps/<name>/dither/` when done. Do not commit it.
12. Import the SVG from `src/` in the app code.
13. Set the color in CSS:
    ```css
    svg { fill: green; }
    ```

## What the script does

- Reads each SVG in the input folder.
- Drops every black `<rect>`.
- Finds the bounds of the white artwork.
- Rewrites the root `viewBox` to that bound.
- Removes `width`, `height`, and `fill` from the root `<svg>`.
- Writes the result to the output folder.

## Verification

- Open one output SVG in a browser.
- Confirm the artwork fills the viewBox with no black border.
- Confirm the fill responds to your CSS rule.

## If the script reports "no white artwork found"

- The input SVG has no white rects.
- Check the Dither it! export settings.
- Re-export the SVG.

## If a file takes too long

- Large source images make large SVGs.
- Use a smaller source image.
- Re-export from Dither it! at a lower resolution.
