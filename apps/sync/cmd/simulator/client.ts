import { TextLineStream } from "@std/streams/text-line-stream";

const lines = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream());

for await (const line of lines) {
  try {
    const { payload } = JSON.parse(line);

    const result = handle(payload);

    console.log(JSON.stringify({ result }));
  } catch (err) {
    console.log(
      JSON.stringify({
        error: String(err),
      }),
    );
  }
}

function handle(payload: { n: number }) {
  console.error(payload);
  if (!payload) return 1;
  if (!payload.n) return 1;
  return Math.abs(payload.n) * 2;
}
