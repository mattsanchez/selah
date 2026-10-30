import { describe, expect, it } from "vitest";

import { originFrom } from "./site-origin";

const headers = (values: Record<string, string>) => new Headers(values);

describe("originFrom", () => {
  it("is SELAH_URL when it is set", () => {
    expect(originFrom(headers({ host: "evil.example" }), "https://selah.example.org")).toBe(
      "https://selah.example.org",
    );
  });

  it("is the host the request came to otherwise, as a proxy passes it on", () => {
    expect(originFrom(headers({ host: "127.0.0.1:3000" }), undefined)).toBe("http://127.0.0.1:3000");
    expect(
      originFrom(
        headers({ host: "127.0.0.1:3000", "x-forwarded-host": "Selah.Example.org", "x-forwarded-proto": "https, http" }),
        undefined,
      ),
    ).toBe("https://selah.example.org");
  });

  it("does not take a host header that is not a host", () => {
    expect(originFrom(headers({ host: `x"><script>` }), undefined)).toBe("http://localhost");
    expect(originFrom(headers({ "x-forwarded-host": "a b", host: "ok.example" }), undefined)).toBe(
      "http://ok.example",
    );
  });
});
