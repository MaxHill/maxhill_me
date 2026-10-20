import { expect, html, fixture } from "@open-wc/testing";
import MBgPattern from "./index";

MBgPattern.define();

function patternImages(element: MBgPattern): string[] {
  return Array.from(element.shadowRoot!.querySelectorAll<HTMLElement>(".background-pattern"))
    .map((layer) => getComputedStyle(layer).backgroundImage);
}

describe("m-bg-pattern patterns", () => {
  it("defaults both layers to the shared grid pattern with standard spacing", async () => {
    const element = await fixture<MBgPattern>(html`
      <m-bg-pattern></m-bg-pattern>
    `);
    expect(element.pattern).to.equal("grid");
    for (const image of patternImages(element)) {
      expect(image).to.contain("linear-gradient");
      expect(image).to.contain("to right");
    }
    const grid = element.shadowRoot!.querySelector<HTMLElement>(".grid")!;
    expect(getComputedStyle(grid).backgroundSize).to.equal("10px 10px, 10px 10px");
  });

  for (const pattern of ["lines", "dots", "diagonal", "grid"] as const) {
    it(`uses the shared ${pattern} pattern on both layers`, async () => {
      const element = await fixture<MBgPattern>(html`
        <m-bg-pattern pattern=${pattern}></m-bg-pattern>
      `);
      expect(element.pattern).to.equal(pattern);
      for (const image of patternImages(element)) {
        expect(image).to.not.equal("none");
        if (pattern === "dots") {
          expect(image).to.contain("radial-gradient");
        } else if (pattern === "diagonal") {
          expect(image).to.contain("45deg");
        } else if (pattern === "lines") {
          expect(image).to.contain("repeating-linear-gradient(to right");
        } else {
          expect(image).to.contain("linear-gradient");
          expect(image).to.contain("to right");
        }
      }
    });
  }

  it("updates patterns without replacing the spotlight", async () => {
    const element = await fixture<MBgPattern>(html`
      <m-bg-pattern></m-bg-pattern>
    `);
    const spot = element.shadowRoot!.querySelector(".spot");
    element.pattern = "dots";
    expect(element.getAttribute("pattern")).to.equal("dots");
    expect(patternImages(element)[0]).to.contain("radial-gradient");
    element.setAttribute("pattern", "diagonal");
    expect(element.pattern).to.equal("diagonal");
    expect(patternImages(element)[1]).to.contain("45deg");
    element.setAttribute("pattern", "unsupported");
    expect(patternImages(element)[0]).to.contain("to right");
    element.removeAttribute("pattern");
    expect(patternImages(element)[0]).to.contain("to right");
    expect(element.shadowRoot!.querySelector(".spot")).to.equal(spot);
  });
});

describe("m-bg-pattern sizes", () => {
  for (const size of ["1", "3", "15", "fluid-1", "fluid-10"]) {
    it(`uses the ${size} spacing token on both layers`, async () => {
      const element = await fixture<MBgPattern>(html`
        <m-bg-pattern data-size=${size}></m-bg-pattern>
      `);
      element.style.setProperty(`--size-${size}`, "24px");
      expect(element.size).to.equal(size);
      for (const layer of element.shadowRoot!.querySelectorAll(".background-pattern")) {
        expect(getComputedStyle(layer).backgroundSize).to.equal("24px 24px, 24px 24px");
      }
    });
  }

  it("reflects size updates and restores utility spacing for missing or invalid sizes", async () => {
    const element = await fixture<MBgPattern>(html`
      <m-bg-pattern style="--size-5: 32px; --size-fluid-2: 48px"></m-bg-pattern>
    `);
    const grid = element.shadowRoot!.querySelector(".grid")!;
    const spot = element.shadowRoot!.querySelector(".spot")!;
    element.size = "5";
    expect(element.getAttribute("data-size")).to.equal("5");
    expect(getComputedStyle(grid).backgroundSize).to.equal("32px 32px, 32px 32px");
    expect(getComputedStyle(spot).backgroundSize).to.equal(getComputedStyle(grid).backgroundSize);
    element.setAttribute("data-size", "fluid-2");
    expect(element.size).to.equal("fluid-2");
    expect(getComputedStyle(grid).backgroundSize).to.equal("48px 48px, 48px 48px");
    element.size = "24px";
    expect(getComputedStyle(grid).backgroundSize).to.equal("10px 10px, 10px 10px");
    element.removeAttribute("data-size");
    expect(getComputedStyle(grid).backgroundSize).to.equal("10px 10px, 10px 10px");
  });
});

describe("m-bg-pattern", () => {
  it("renders slotted content above its decorative grid", async () => {
    const el = await fixture<MBgPattern>(html`
      <m-bg-pattern><p>Content</p></m-bg-pattern>
    `);

    const slot = el.shadowRoot?.querySelector("slot");
    expect(slot).to.exist;
    expect(slot?.hasAttribute("part")).to.equal(false);
    expect(slot?.parentNode).to.equal(el.shadowRoot);
    expect(slot?.previousElementSibling?.classList.contains("grid")).to.equal(true);
    expect(el.shadowRoot?.querySelector(".content")).to.not.exist;
    expect(el.shadowRoot?.querySelector(".grid").getAttribute("aria-hidden")).to.equal("true");
    expect(el.textContent).to.contain("Content");
  });

  it("lets slotted content participate in the host grid layout", async () => {
    const el = await fixture<MBgPattern>(html`
      <m-bg-pattern style="display: grid; place-items: center; width: 400px; height: 200px">
        <div style="width: 100%; height: 40px">Content</div>
      </m-bg-pattern>
    `)
    const content = el.querySelector("div")

    expect(content?.getBoundingClientRect().width).to.equal(400)
    expect(content?.getBoundingClientRect().height).to.equal(40)
  })

  it("moves the spotlight with the pointer and hides it on leave", async () => {
    const el = await fixture<MBgPattern>(html`<m-bg-pattern></m-bg-pattern>`);
    const spot = el.shadowRoot?.querySelector<HTMLElement>(".spot");
    const bounds = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointermove", {
      clientX: bounds.left + 30,
      clientY: bounds.top + 40,
      bubbles: true,
    }));

    expect(spot?.style.left).to.equal("30px");
    expect(spot?.style.top).to.equal("40px");
    expect(spot?.style.getPropertyValue("--_pointer-x")).to.equal("30px");
    expect(spot?.style.getPropertyValue("--_pointer-y")).to.equal("40px");
    expect(spot?.style.opacity).to.equal("1");
    el.dispatchEvent(new PointerEvent("pointerleave"));
    expect(spot?.style.opacity).to.equal("0");
  });
});
