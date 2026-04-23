import UniversalRouter, {
  type RouteContext,
} from "../../vendor/universal-router/src/universal-router.ts";

const routes = [
  {
    path: "",
    action: () => {
      document.title = "Golf Bag Tracker";
      return `<m-bag-list-page/>`;
    },
  },
  {
    path: "/bag",
    action: () => {
      document.title = "Golf Bag Tracker";
      return `<m-bag-list-page/>`;
    },
  },
  {
    path: "/bag/add",
    action: () => {
      document.title = "Add Club - Golf Bag Tracker";
      return `<m-bag-add-page/>`;
    },
  },
  {
    path: "/bag/edit/:key",
    action: ({ params }: RouteContext) => {
      document.title = `Edit Club - Golf Bag Tracker`;
      return `<m-bag-edit-page club-key="${params.key}"/>`;
    },
  },
  {
    path: "/bag/club/add",
    action: () => {
      document.title = "Add Club - Golf Bag Tracker";
      return `
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
      return `
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
      return `
    <div class="stack" data-gap="4">
      <m-add-shot-type-form></m-add-shot-type-form>
      <a href="/" aria-label="Go back to home page">Back</a>
    </div>
`;
    },
  },
  {
    path: "/404",
    action: () => {
      document.title = "404 Not Found - Golf Bag Tracker";
      return `
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
      app.innerHTML = html;
    }
  }
}

// Intercept all link clicks for client-side navigation
// Handle any element with href attribute
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  
  // Find the closest element with an href attribute
  const elementWithHref = target.closest("[href]") as HTMLElement;
  
  if (!elementWithHref) return;
  
  // Get href from attribute (works for custom elements) or property (works for <a>)
  const href = elementWithHref.getAttribute("href") || (elementWithHref as HTMLAnchorElement).href;
  
  if (!href) return;
  
  // Handle <a> tags with full URLs
  if (elementWithHref instanceof HTMLAnchorElement && elementWithHref.origin === window.location.origin) {
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
