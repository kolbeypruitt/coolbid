export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          company_name: string;
          company_email: string;
          company_phone: string;
          address: string;
          state: string;
          zip: string;
          stripe_customer_id: string | null;
          subscription_tier: string;
          subscription_status: string;
          trial_ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          company_name?: string;
          company_email?: string;
          company_phone?: string;
          address?: string;
          state?: string;
          zip?: string;
          stripe_customer_id?: string | null;
          subscription_tier?: string;
          subscription_status?: string;
          trial_ends_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      estimates: {
        Row: {
          id: string;
          user_id: string;
          project_name: string;
          customer_name: string;
          status: "draft" | "sent" | "accepted";
          total_sqft: number | null;
          num_units: number;
          hvac_per_unit: boolean;
          climate_zone: string;
          profit_margin: number;
          labor_rate: number;
          labor_hours: number;
          supplier_name: string;
          total_material_cost: number | null;
          total_price: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_name?: string;
          customer_name?: string;
          status?: "draft" | "sent" | "accepted";
          total_sqft?: number | null;
          num_units?: number;
          hvac_per_unit?: boolean;
          climate_zone?: string;
          profit_margin?: number;
          labor_rate?: number;
          labor_hours?: number;
          supplier_name?: string;
          total_material_cost?: number | null;
          total_price?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["estimates"]["Insert"]>;
      };
      estimate_rooms: {
        Row: {
          id: string;
          estimate_id: string;
          name: string;
          type: string;
          floor: number;
          sqft: number | null;
          length_ft: number | null;
          width_ft: number | null;
          ceiling_height: number;
          window_count: number;
          exterior_walls: number;
          btu_load: number | null;
          tonnage: number | null;
          cfm_required: number | null;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          estimate_id: string;
          name: string;
          type: string;
          floor?: number;
          sqft?: number | null;
          length_ft?: number | null;
          width_ft?: number | null;
          ceiling_height?: number;
          window_count?: number;
          exterior_walls?: number;
          btu_load?: number | null;
          tonnage?: number | null;
          cfm_required?: number | null;
          notes?: string;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_rooms"]["Insert"]>;
      };
      estimate_bom_items: {
        Row: {
          id: string;
          estimate_id: string;
          category: string;
          description: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          total_cost: number;
          part_id: string | null;
          supplier: string | null;
          sku: string | null;
          notes: string;
          source: string;
          room_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          estimate_id: string;
          category: string;
          description: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          total_cost: number;
          part_id?: string | null;
          supplier?: string | null;
          sku?: string | null;
          notes?: string;
          source?: string;
          room_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_bom_items"]["Insert"]>;
      };
      floorplans: {
        Row: {
          id: string;
          estimate_id: string;
          storage_path: string;
          file_name: string;
          file_type: string;
          page_numbers: number[];
          analysis_result: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          estimate_id: string;
          storage_path: string;
          file_name: string;
          file_type: string;
          page_numbers?: number[];
          analysis_result?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["floorplans"]["Insert"]>;
      };
    };
  };
};
