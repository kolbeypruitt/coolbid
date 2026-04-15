// Historical starter-kit seed data was removed with migration 016
// (`016_retire_starter_wire_vendors.sql`). New users now pick from the
// global `vendors` table during onboarding and import individual rows
// from `vendor_products` on demand, instead of getting a hardcoded kit.
//
// This file is intentionally a thin shim that re-exports the supplier
// card shape consumed by the onboarding picker, so the UI component
// keeps its prop contract.

export type SupplierCard = {
  slug: string;
  name: string;
  brands: string[];
};
