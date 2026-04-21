import UniversalRouter from "../../vendor/universal-router/src/universal-router.ts";

const routes = [
  {
    path: "",
    action: () => {
      document.title = "Golf Bag Tracker";
      return `
    <div class="grid" data-cols="2" data-gap="4">
      <m-club-list></m-club-list>
      <m-shot-type-list></m-shot-type-list>

      <a href="/bag/club/add" aria-label="Add a new club to your bag">Add club</a>
      <a href="/bag/shot-type/add" aria-label="Add a new shot type">Add shot type</a>
    </div>
`;
    },
  },
  {
    path: "/bag/club/add",
    action: () => {
      document.title = "Add Club - Golf Bag Tracker";
      return `
    <div class="stack" data-gap="4">
      <m-add-club-form></m-add-club-form>
      <a href="/" aria-label="Go back to home page">Back</a>
    </div>
`;
    },
  },
  {
    path: "/bag/club/:key/edit",
    action: () => {
      document.title = `Edit Club - Golf Bag Tracker`;
      return `
    <div class="stack" data-gap="4">
      <h1>Edit club</h1>
      <m-add-club-form></m-add-club-form>
      <a href="/" aria-label="Go back to home page">Back</a>
    </div>
`;
    },
  },
  {
    path: "/bag/shot-type/add",
    action: () => {
      document.title = "Add Shot Type - Golf Bag Tracker";
      return `
    <div class="stack" data-gap="4">
      <m-add-shot-type-form></m-add-shot-type-form>
      <a href="/" aria-label="Go back to home page">Back</a>
    </div>
`;
    },
  },
];

const router = new UniversalRouter(routes);

async function resolve(path?: string) {
  const pathname = path || window.location.pathname;
  const html = await router.resolve({ pathname });
  if (html) {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = html;
    }
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
