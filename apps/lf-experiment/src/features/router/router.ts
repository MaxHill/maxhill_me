import UniversalRouter from "../../vendor/universal-router/src/universal-router.ts";
import type { RouteContext } from "../../vendor/universal-router/src/universal-router.ts";

const routes = [
  {
    path: "",
    action: () => `
    <div class="grid" data-cols="2" data-gap="4">
      <m-club-list></m-club-list>
      <m-shot-type-list></m-shot-type-list>

      <a href="/bag/club/add">Add club</a>
      <a href="/bag/shot-type/add">Add shot type</a>
    </div>
`,
  },
  {
    path: "/bag/club/add",
    action: () => `
    <div class="stack" data-gap="4">
      <m-add-club-form></m-add-club-form>
      <a href="/">Back</a>
    </div>
`,
  },
  {
    path: "/bag/club/:key/edit",
    action: ({ params }: RouteContext) => `
    <div class="stack" data-gap="4">
      <h1>Edit: ${params.key}</h1>
      <m-add-club-form></m-add-club-form>
      <a href="/">Back</a>
    </div>
`,
  },
  {
    path: "/bag/shot-type/add",
    action: () => `
    <div class="stack" data-gap="4">
      <m-add-shot-type-form></m-add-shot-type-form>
      <a href="/">Back</a>
    </div>
`,
  },
];

const router = new UniversalRouter(routes);

async function resolve(path?: string) {
  const pathname = path || window.location.pathname;
  const html = await router.resolve({ pathname });
  if (html) {
    document.body.innerHTML = html;
  }
}

// Intercept all link clicks for client-side navigation
// TODO: might be a m-card that is clicked. look for href instead of a
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const link = target.closest("a");

  if (link && link.href && link.origin === window.location.origin) {
    e.preventDefault();
    const url = new URL(link.href);
    window.history.pushState({}, "", url.pathname);
    resolve(url.pathname);
  }
});

// Handle browser back/forward buttons
window.addEventListener("popstate", () => {
  resolve(window.location.pathname);
});

resolve();
