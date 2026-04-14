type Routes = {
  [key: string]: string;
  "not-found": string;
};

export class Router {
  constructor(private mount: string, private routes: Routes) {
    window.addEventListener("popstate", this.handleRouteChange.bind(this));
  }

  public render(e: PopStateEvent) {
    const path = new URL(window.location.href).pathname;

    const mount = document.querySelector(this.mount);
    if (!mount) throw new Error(`No mount '${this.mount} found`);
    mount.innerHTML = this.routes[path] ?? `<h1>404</h1>`;
  }

  private handleRouteChange() {
  }
}
