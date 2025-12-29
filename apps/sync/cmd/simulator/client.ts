import { readLines } from "https://deno.land/std/io/read_lines.ts";

for await (const line of readLines(Deno.stdin)) {
  try {
    const { payload } = JSON.parse(line);

    const result = handle(payload); // pure or deterministic

    console.log(JSON.stringify({ result }));
  } catch (err) {
    console.log(
      JSON.stringify({
        error: String(err),
      }),
    );
  }
}

function handle(payload: any) {
  console.error(payload);
  return payload.n * 2;
}
