import UniversalRouter, { type RouteContext } from "universal-router";
import "../pratice-games/lag-putting/m-lag-putting-scorecard-page";
import { html, render } from "uhtml";

const routes = [
  {
    path: "",
    action: () => {
      document.title = "Golf Bag Tracker";
      return html`
        <m-bag-list-page />
      `;
    },
  },
  {
    path: "/game",
    action: () => {
      document.title = "Lag putting game";
      return html`
        <m-lag-putting-listing-page />
      `;
    },
  },
  {
    path: "/game/:key",
    action: ({ params }: RouteContext) => {
      document.title = "Lag putting game";
      return html`
        <m-lag-putting-scorecard-page game-key="${params.key}" />
      `;
    },
  },
  {
    path: "/bag",
    action: () => {
      document.title = "Golf Bag Tracker";
      return html`
        <m-bag-list-page />
      `;
    },
  },
  {
    path: "/bag/add",
    action: () => {
      document.title = "Add Club - Golf Bag Tracker";
      return html`
        <m-bag-add-page />
      `;
    },
  },
  {
    path: "/bag/edit/:key",
    action: ({ params }: RouteContext) => {
      document.title = `Edit Club - Golf Bag Tracker`;
      return html`
        <m-bag-edit-page club-key="${params.key}" />
      `;
    },
  },
  {
    path: "/bag/club/add",
    action: () => {
      document.title = "Add Club - Golf Bag Tracker";
      return html`
        <div class="stack" data-gap="4">
          <m-club-form></m-club-form>
          <a href="/" aria-label="Go back to home page">Back</a>
        </div>
      `;
    },
  },
  {
    path: "/bag/club/:key/edit",
    action: ({ params }: RouteContext) => {
      document.title = `Edit Club - Golf Bag Tracker`;
      return html`
        <div class="stack" data-gap="4">
          <m-club-form club-key="${params.key}"></m-club-form>
          <a href="/" aria-label="Go back to home page">Back</a>
        </div>
      `;
    },
  },
  {
    path: "/bag/shot-type/add",
    action: () => {
      document.title = "Add Shot Type - Golf Bag Tracker";
      return html`
        <div class="stack" data-gap="4">
          <m-shot-type-form></m-shot-type-form>
          <a href="/bag" aria-label="Go back to bag page">Back</a>
        </div>
      `;
    },
  },
  {
    path: "/bag/shot-type/edit/:key",
    action: ({ params }: RouteContext) => {
      document.title = "Edit Shot Type - Golf Bag Tracker";
      return html`
        <div class="stack" data-gap="4">
          <m-shot-type-form shot-type-key="${params.key}"></m-shot-type-form>
          <a href="/bag" aria-label="Go back to bag page">Back</a>
        </div>
      `;
    },
  },
  {
    path: "/404",
    action: () => {
      document.title = "404 Not Found - Golf Bag Tracker";
      return html`
        <div class="stack" data-gap="4">
          <h1>404 - Page Not Found</h1>
          <p>The page you're looking for doesn't exist.</p>
          <a href="/" aria-label="Go back to home page">Back to Home</a>
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
    const app = document.getElementById("app");
    if (app) {
      render(app, html);
    }
  }
}

// Intercept all link clicks for client-side navigation
// Handle any element with href attribute
document.addEventListener("click", (e) => {
  // Use composedPath() to cross shadow DOM boundaries
  const path = e.composedPath() as HTMLElement[];
  const elementWithHref = path.find(
    (el) => el instanceof HTMLElement && el.hasAttribute?.("href")
  ) as HTMLElement | undefined;

  if (!elementWithHref) return;

  // Get href from attribute (works for custom elements) or property (works for <a>)
  const href = elementWithHref.getAttribute("href") || (elementWithHref as HTMLAnchorElement).href;

  if (!href) return;

  // Handle <a> tags with full URLs
  if (
    elementWithHref instanceof HTMLAnchorElement &&
    elementWithHref.origin === window.location.origin
  ) {
    e.preventDefault();
    const url = new URL(elementWithHref.href);
    window.history.pushState({}, "", url.pathname);
    resolve(url.pathname);
    return;
  }

  // Handle custom elements and relative paths
  if (!(elementWithHref instanceof HTMLAnchorElement)) {
    // Only handle internal navigation (relative paths or same-origin absolute paths)
    if (!href.startsWith("http") || href.startsWith(window.location.origin)) {
      e.preventDefault();
      const pathname = href.startsWith("http") ? new URL(href).pathname : href;
      window.history.pushState({}, "", pathname);
      resolve(pathname);
    }
  }
});

// Handle browser back/forward buttons
window.addEventListener("popstate", () => {
  resolve(window.location.pathname);
});

resolve();
