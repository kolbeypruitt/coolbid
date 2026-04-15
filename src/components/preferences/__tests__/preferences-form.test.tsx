// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { PreferencesForm } from "../preferences-form";
import type { ContractorPreferences } from "@/types/contractor-preferences";

afterEach(() => cleanup());

describe("PreferencesForm", () => {
  it("renders all 8 preference sections", () => {
    const { getByText } = render(
      <PreferencesForm
        initialValue={{}}
        onSave={vi.fn()}
        submitLabel="Save"
        saving={false}
      />,
    );
    expect(getByText(/equipment brands/i)).toBeTruthy();
    expect(getByText(/supply register/i)).toBeTruthy();
    expect(getByText(/return grille/i)).toBeTruthy();
    expect(getByText(/duct trunk/i)).toBeTruthy();
    expect(getByText(/filter size/i)).toBeTruthy();
    expect(getByText(/filter merv rating/i)).toBeTruthy();
    expect(getByText(/thermostat/i)).toBeTruthy();
    expect(getByText(/additional notes/i)).toBeTruthy();
  });

  it("hydrates equipment_brands and notes from initialValue", () => {
    const initial: ContractorPreferences = {
      equipment_brands: ["Carrier"],
      additional_notes: "hello",
    };
    const { getByLabelText, getByDisplayValue } = render(
      <PreferencesForm
        initialValue={initial}
        onSave={vi.fn()}
        submitLabel="Save"
        saving={false}
      />,
    );
    const carrierCheckbox = getByLabelText("Carrier") as HTMLInputElement;
    expect(carrierCheckbox.checked).toBe(true);
    expect(getByDisplayValue("hello")).toBeTruthy();
  });

  it("calls onSave with the collected preferences", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByText } = render(
      <PreferencesForm
        initialValue={{}}
        onSave={onSave}
        submitLabel="Save"
        saving={false}
      />,
    );

    fireEvent.click(getByLabelText("Carrier"));
    fireEvent.change(getByLabelText(/additional notes/i), {
      target: { value: "spec braided whips" },
    });
    fireEvent.click(getByText("Save"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as ContractorPreferences;
    expect(saved.equipment_brands).toEqual(["Carrier"]);
    expect(saved.additional_notes).toBe("spec braided whips");
  });

  it("disables submit button when saving=true", () => {
    const { getByText } = render(
      <PreferencesForm
        initialValue={{}}
        onSave={vi.fn()}
        submitLabel="Save"
        saving={true}
      />,
    );
    const btn = getByText("Save").closest("button")!;
    expect(btn.disabled).toBe(true);
  });

  it("toggles equipment_brands multi-select on and off", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByText } = render(
      <PreferencesForm
        initialValue={{ equipment_brands: ["Carrier", "Trane"] }}
        onSave={onSave}
        submitLabel="Save"
        saving={false}
      />,
    );
    fireEvent.click(getByLabelText("Carrier")); // uncheck
    fireEvent.click(getByLabelText("Daikin")); // check
    fireEvent.click(getByText("Save"));
    const saved = onSave.mock.calls[0][0] as ContractorPreferences;
    expect(saved.equipment_brands?.sort()).toEqual(["Daikin", "Trane"]);
  });
});
