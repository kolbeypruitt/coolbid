export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    PostgrestVersion: "12";
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
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
          onboarding_completed: boolean;
          ai_actions_used: number;
          stripe_subscription_id: string | null;
          subscription_period_end: string | null;
          referral_source: string | null;
          referral_code: string | null;
          default_display_mode: "total_only" | "itemized";
          default_quote_validity_days: number;
          logo_url: string | null;
          logo_content_type: string | null;
          team_id: string | null;
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
          onboarding_completed?: boolean;
          ai_actions_used?: number;
          stripe_subscription_id?: string | null;
          subscription_period_end?: string | null;
          referral_source?: string | null;
          referral_code?: string | null;
          default_display_mode?: "total_only" | "itemized";
          default_quote_validity_days?: number;
          logo_url?: string | null;
          logo_content_type?: string | null;
          team_id?: string | null;
        };
        Update: {
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
          ai_actions_used?: number;
          stripe_subscription_id?: string | null;
          subscription_period_end?: string | null;
          referral_source?: string | null;
          referral_code?: string | null;
          default_display_mode?: "total_only" | "itemized";
          default_quote_validity_days?: number;
          logo_url?: string | null;
          logo_content_type?: string | null;
          team_id?: string | null;
        };
        Relationships: [];
      };
      estimates: {
        Row: {
          id: string;
          user_id: string;
          project_name: string;
          customer_name: string;
          status: "draft" | "sent" | "accepted" | "declined";
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
          system_type: "heat_pump" | "gas_ac" | "electric" | "dual_fuel";
          created_at: string;
          updated_at: string;
          job_address: string | null;
          customer_email: string | null;
          customer_phone: string | null;
          note_to_customer: string | null;
          valid_until: string | null;
          display_mode: "total_only" | "itemized";
          scope_of_work: string | null;
          accepted_at: string | null;
          declined_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_name?: string;
          customer_name?: string;
          status?: "draft" | "sent" | "accepted" | "declined";
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
          system_type?: "heat_pump" | "gas_ac" | "electric" | "dual_fuel";
          job_address?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          note_to_customer?: string | null;
          valid_until?: string | null;
          display_mode?: "total_only" | "itemized";
          scope_of_work?: string | null;
          accepted_at?: string | null;
          declined_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["estimates"]["Insert"]>;
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          contact_email: string;
          contact_phone: string;
          brands: string[];
          is_starter: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          contact_email?: string;
          contact_phone?: string;
          brands?: string[];
          is_starter?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Insert"]>;
        Relationships: [];
      };
      equipment_catalog: {
        Row: {
          id: string;
          user_id: string;
          supplier_id: string | null;
          model_number: string;
          description: string;
          equipment_type: string;
          system_type: string;
          brand: string;
          tonnage: number | null;
          seer_rating: number | null;
          btu_capacity: number | null;
          stages: number | null;
          refrigerant_type: string | null;
          unit_price: number | null;
          unit_of_measure: string;
          source: string;
          usage_count: number;
          last_quoted_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          supplier_id?: string | null;
          model_number: string;
          description?: string;
          equipment_type: string;
          system_type?: string;
          brand?: string;
          tonnage?: number | null;
          seer_rating?: number | null;
          btu_capacity?: number | null;
          stages?: number | null;
          refrigerant_type?: string | null;
          unit_price?: number | null;
          unit_of_measure?: string;
          source?: string;
          usage_count?: number;
          last_quoted_date?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_catalog"]["Insert"]>;
        Relationships: [];
      };
      quotes: {
        Row: {
          id: string;
          user_id: string;
          supplier_id: string | null;
          quote_number: string;
          quote_date: string | null;
          subtotal: number | null;
          tax: number | null;
          total: number | null;
          file_name: string;
          storage_path: string;
          status: "parsed" | "reviewing" | "saved" | "rejected";
          source_type: "manual_upload" | "email_attachment" | "email_body";
          source_email_id: string | null;
          source_email_subject: string | null;
          source_email_from: string | null;
          source_email_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          supplier_id?: string | null;
          quote_number?: string;
          quote_date?: string | null;
          subtotal?: number | null;
          tax?: number | null;
          total?: number | null;
          file_name: string;
          storage_path?: string;
          status?: "parsed" | "reviewing" | "saved" | "rejected";
          source_type?: "manual_upload" | "email_attachment" | "email_body";
          source_email_id?: string | null;
          source_email_subject?: string | null;
          source_email_from?: string | null;
          source_email_date?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["quotes"]["Insert"]>;
        Relationships: [];
      };
      quote_lines: {
        Row: {
          id: string;
          quote_id: string;
          catalog_item_id: string | null;
          model_number: string;
          description: string;
          equipment_type: string;
          brand: string;
          tonnage: number | null;
          seer_rating: number | null;
          btu_capacity: number | null;
          stages: number | null;
          refrigerant_type: string | null;
          quantity: number;
          unit_price: number | null;
          extended_price: number | null;
          selected: boolean;
        };
        Insert: {
          id?: string;
          quote_id: string;
          catalog_item_id?: string | null;
          model_number?: string;
          description?: string;
          equipment_type?: string;
          brand?: string;
          tonnage?: number | null;
          seer_rating?: number | null;
          btu_capacity?: number | null;
          stages?: number | null;
          refrigerant_type?: string | null;
          quantity?: number;
          unit_price?: number | null;
          extended_price?: number | null;
          selected?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["quote_lines"]["Insert"]>;
        Relationships: [];
      };
      price_history: {
        Row: {
          id: string;
          catalog_item_id: string;
          supplier_id: string | null;
          price: number;
          quote_date: string | null;
          quote_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          catalog_item_id: string;
          supplier_id?: string | null;
          price: number;
          quote_date?: string | null;
          quote_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["price_history"]["Insert"]>;
        Relationships: [];
      };
      email_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: "gmail";
          email_address: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          scopes: string[];
          connected_at: string;
          last_sync_at: string | null;
          last_sync_status: "idle" | "syncing" | "error";
          last_sync_error: string | null;
          sync_cursor: string | null;
          initial_sync_days: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: "gmail";
          email_address: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          scopes?: string[];
          connected_at?: string;
          last_sync_at?: string | null;
          last_sync_status?: "idle" | "syncing" | "error";
          last_sync_error?: string | null;
          sync_cursor?: string | null;
          initial_sync_days?: number;
        };
        Update: Partial<Database["public"]["Tables"]["email_connections"]["Insert"]>;
        Relationships: [];
      };
      supplier_email_domains: {
        Row: {
          id: string;
          user_id: string | null;
          supplier_id: string | null;
          domain: string;
          is_starter: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          supplier_id?: string | null;
          domain: string;
          is_starter?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["supplier_email_domains"]["Insert"]>;
        Relationships: [];
      };
      billing_events: {
        Row: {
          id: string;
          user_id: string | null;
          event_type: string;
          stripe_event_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          event_type: string;
          stripe_event_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          event_type?: string;
          stripe_event_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string | null;
          email: string;
          role: string;
          status: string;
          invited_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id?: string | null;
          email: string;
          role?: string;
          status?: string;
        };
        Update: {
          user_id?: string | null;
          status?: string;
          accepted_at?: string | null;
        };
        Relationships: [];
      };
      email_events: {
        Row: {
          id: string;
          user_id: string;
          email_type: string;
          sent_at: string;
          resend_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_type: string;
          resend_id?: string | null;
        };
        Update: {
          resend_id?: string | null;
        };
        Relationships: [];
      };
      estimate_shares: {
        Row: {
          id: string;
          estimate_id: string;
          token: string;
          created_at: string;
          expires_at: string;
          revoked_at: string | null;
          first_viewed_at: string | null;
          last_viewed_at: string | null;
          view_count: number;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          estimate_id: string;
          token: string;
          expires_at: string;
          revoked_at?: string | null;
          first_viewed_at?: string | null;
          last_viewed_at?: string | null;
          view_count?: number;
          responded_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["estimate_shares"]["Insert"]>;
        Relationships: [];
      };
    };
  };
};
