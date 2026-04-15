"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { ContractorPreferences } from "@/types/contractor-preferences";
import {
  EQUIPMENT_BRANDS,
  SUPPLY_REGISTER_STYLES,
  RETURN_GRILLE_SIZINGS,
  DUCT_TRUNK_MATERIALS,
  FILTER_SIZES,
  FILTER_MERV_RATINGS,
  THERMOSTAT_BRANDS,
} from "@/lib/hvac/contractor-preferences-options";

type Props = {
  initialValue: ContractorPreferences;
  onSave: (prefs: ContractorPreferences) => Promise<void> | void;
  submitLabel: string;
  saving: boolean;
};

export function PreferencesForm({ initialValue, onSave, submitLabel, saving }: Props) {
  const [brands, setBrands] = useState<string[]>(initialValue.equipment_brands ?? []);
  const [registerStyle, setRegisterStyle] = useState(
    initialValue.supply_register_style ?? "",
  );
  const [returnGrille, setReturnGrille] = useState(
    initialValue.return_grille_sizing ?? "",
  );
  const [trunkMaterial, setTrunkMaterial] = useState(
    initialValue.duct_trunk_material ?? "",
  );
  const [filterSize, setFilterSize] = useState(initialValue.filter_size ?? "");
  const [merv, setMerv] = useState(initialValue.filter_merv ?? "");
  const [thermostat, setThermostat] = useState(initialValue.thermostat_brand ?? "");
  const [notes, setNotes] = useState(initialValue.additional_notes ?? "");

  function toggleBrand(brand: string) {
    setBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const prefs: ContractorPreferences = {
      equipment_brands: brands.length > 0 ? brands : undefined,
      supply_register_style: registerStyle || undefined,
      return_grille_sizing: returnGrille || undefined,
      duct_trunk_material: trunkMaterial || undefined,
      filter_size: filterSize || undefined,
      filter_merv: merv || undefined,
      thermostat_brand: thermostat || undefined,
      additional_notes: notes.trim() || undefined,
    };
    await onSave(prefs);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>Equipment brands you typically install</Label>
        <p className="text-sm text-muted-foreground">Select all that apply.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EQUIPMENT_BRANDS.map((brand) => (
            <label key={brand} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={brands.includes(brand)}
                onChange={() => toggleBrand(brand)}
                aria-label={brand}
              />
              {brand}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Supply register style</Label>
        <Select value={registerStyle} onValueChange={setRegisterStyle}>
          <SelectTrigger>
            <SelectValue placeholder="Select a style" />
          </SelectTrigger>
          <SelectContent>
            {SUPPLY_REGISTER_STYLES.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Return grille sizing</Label>
        <Select value={returnGrille} onValueChange={setReturnGrille}>
          <SelectTrigger>
            <SelectValue placeholder="Select sizing" />
          </SelectTrigger>
          <SelectContent>
            {RETURN_GRILLE_SIZINGS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Duct trunk material</Label>
        <Select value={trunkMaterial} onValueChange={setTrunkMaterial}>
          <SelectTrigger>
            <SelectValue placeholder="Select material" />
          </SelectTrigger>
          <SelectContent>
            {DUCT_TRUNK_MATERIALS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Filter size</Label>
        <Select value={filterSize} onValueChange={setFilterSize}>
          <SelectTrigger>
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            {FILTER_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Filter MERV rating</Label>
        <Select value={merv} onValueChange={setMerv}>
          <SelectTrigger>
            <SelectValue placeholder="Select MERV rating" />
          </SelectTrigger>
          <SelectContent>
            {FILTER_MERV_RATINGS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Thermostat brand</Label>
        <Select value={thermostat} onValueChange={setThermostat}>
          <SelectTrigger>
            <SelectValue placeholder="Select brand" />
          </SelectTrigger>
          <SelectContent>
            {THERMOSTAT_BRANDS.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contractor-prefs-notes">Additional notes</Label>
        <p className="text-sm text-muted-foreground">
          Anything else the AI parts generator should know — specific suppliers, brands to avoid, install quirks.
        </p>
        <Textarea
          id="contractor-prefs-notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. I buy all my registers from Locke Supply and prefer square flush-mount."
        />
      </div>

      <Button type="submit" disabled={saving}>
        {submitLabel}
      </Button>
    </form>
  );
}
