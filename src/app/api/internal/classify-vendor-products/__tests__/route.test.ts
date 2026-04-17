import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv, INTERNAL_API_TOKEN: "test-token" };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("POST /api/internal/classify-vendor-products", () => {
  it("rejects missing Authorization header with 401", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://x/api/internal/classify-vendor-products", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects wrong token with 401", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://x/api/internal/classify-vendor-products", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 and reports zero remaining when no unclassified rows", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "vendor_products") {
            // v2 query shape: .or(staleFilter).limit(N) for the SELECT,
            // and .or(staleFilter) for the count with head:true.
            return {
              select: () => ({
                or: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                  then: (fn: (v: { count: number }) => unknown) =>
                    Promise.resolve({ count: 0 }).then(fn),
                }),
              }),
              update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            };
          }
          return {};
        },
      }),
    }));
    vi.doMock("@/lib/anthropic", () => ({ anthropic: {} }));
    vi.doMock("@/lib/hvac/vendor-classifier-llm", () => ({
      classifyVendorProductsBatch: vi.fn().mockResolvedValue([]),
      createAnthropicClassifier: vi.fn(),
      CLASSIFIER_VERSION: 2,
    }));
    const { POST } = await import("../route");
    const req = new Request("http://x/api/internal/classify-vendor-products", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classified).toBe(0);
  });
});
