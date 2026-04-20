import UniversalRouter from "../../vendor/universal-router/src/universal-router.ts"

const routes = [
  {
    path: '', 
    action: () => `<h1>Home</h1>`,
  },
];

const router = new UniversalRouter(routes);

function resolve(path: string) {
    const pathname = path || new URL(window.location).pathname;
    router.resolve({pathname}).then((html) => {
        document.body.innerHTML = html // renders: <h1>Posts</h1>
    })
}

resolve();
