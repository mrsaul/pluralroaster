export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_onboarding_legacy: {
        Row: {
          admin_notes: string | null
          client_data_mode: string
          coffee_type: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          current_step: number | null
          custom_company_name: string | null
          custom_contact_name: string | null
          custom_delivery_address: string | null
          custom_email: string | null
          custom_phone: string | null
          custom_pricing_tier: string | null
          delivery_address: string | null
          delivery_instructions: string | null
          delivery_time_window: string | null
          email: string | null
          estimated_weekly_volume: number | null
          grinder_type: string | null
          id: string
          last_synced_at: string | null
          legal_company_name: string | null
          min_order_kg: number | null
          notes: string | null
          onboarding_status: string | null
          payment_terms: string | null
          phone: string | null
          preferred_delivery_days: string[] | null
          pricing_tier: string | null
          pricing_tier_id: string | null
          sellsy_client_id: string | null
          siret: string | null
          updated_at: string
          user_id: string
          vat_number: string | null
        }
        Insert: {
          admin_notes?: string | null
          client_data_mode?: string
          coffee_type?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          current_step?: number | null
          custom_company_name?: string | null
          custom_contact_name?: string | null
          custom_delivery_address?: string | null
          custom_email?: string | null
          custom_phone?: string | null
          custom_pricing_tier?: string | null
          delivery_address?: string | null
          delivery_instructions?: string | null
          delivery_time_window?: string | null
          email?: string | null
          estimated_weekly_volume?: number | null
          grinder_type?: string | null
          id?: string
          last_synced_at?: string | null
          legal_company_name?: string | null
          min_order_kg?: number | null
          notes?: string | null
          onboarding_status?: string | null
          payment_terms?: string | null
          phone?: string | null
          preferred_delivery_days?: string[] | null
          pricing_tier?: string | null
          pricing_tier_id?: string | null
          sellsy_client_id?: string | null
          siret?: string | null
          updated_at?: string
          user_id: string
          vat_number?: string | null
        }
        Update: {
          admin_notes?: string | null
          client_data_mode?: string
          coffee_type?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          current_step?: number | null
          custom_company_name?: string | null
          custom_contact_name?: string | null
          custom_delivery_address?: string | null
          custom_email?: string | null
          custom_phone?: string | null
          custom_pricing_tier?: string | null
          delivery_address?: string | null
          delivery_instructions?: string | null
          delivery_time_window?: string | null
          email?: string | null
          estimated_weekly_volume?: number | null
          grinder_type?: string | null
          id?: string
          last_synced_at?: string | null
          legal_company_name?: string | null
          min_order_kg?: number | null
          notes?: string | null
          onboarding_status?: string | null
          payment_terms?: string | null
          phone?: string | null
          preferred_delivery_days?: string[] | null
          pricing_tier?: string | null
          pricing_tier_id?: string | null
          sellsy_client_id?: string | null
          siret?: string | null
          updated_at?: string
          user_id?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_pricing_tier_id_fkey"
            columns: ["pricing_tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          admin_notes: string | null
          archived: boolean | null
          auxiliary_account: string | null
          client_data_mode: string
          coffee_type: string | null
          company_type: string | null
          created_at: string | null
          current_step: number | null
          delivery_instructions: string | null
          delivery_time_window: string | null
          email: string | null
          employee_count: string | null
          estimated_weekly_volume: number | null
          fax: string | null
          grinder_type: string | null
          id: string
          last_synced_at: string | null
          legal_company_name: string | null
          legal_form: string | null
          min_order_kg: number | null
          mobile: string | null
          naf_code: string | null
          name: string
          notes: string | null
          onboarding_status: string | null
          owner: string | null
          payment_terms: string | null
          phone: string | null
          preferred_delivery_days: string[] | null
          pricing_tier_id: string | null
          rate_category: string | null
          rcs: string | null
          reference: string | null
          sellsy_client_id: string | null
          sellsy_created_at: string | null
          sellsy_id: string | null
          share_capital: string | null
          siren: string | null
          siret: string | null
          smart_tags: string[] | null
          subscribed_custom: boolean | null
          subscribed_email: boolean | null
          subscribed_mail: boolean | null
          subscribed_phone: boolean | null
          subscribed_sms: boolean | null
          third_party_account: string | null
          type: string | null
          updated_at: string | null
          vat_number: string | null
          website: string | null
        }
        Insert: {
          admin_notes?: string | null
          archived?: boolean | null
          auxiliary_account?: string | null
          client_data_mode?: string
          coffee_type?: string | null
          company_type?: string | null
          created_at?: string | null
          current_step?: number | null
          delivery_instructions?: string | null
          delivery_time_window?: string | null
          email?: string | null
          employee_count?: string | null
          estimated_weekly_volume?: number | null
          fax?: string | null
          grinder_type?: string | null
          id?: string
          last_synced_at?: string | null
          legal_company_name?: string | null
          legal_form?: string | null
          min_order_kg?: number | null
          mobile?: string | null
          naf_code?: string | null
          name: string
          notes?: string | null
          onboarding_status?: string | null
          owner?: string | null
          payment_terms?: string | null
          phone?: string | null
          preferred_delivery_days?: string[] | null
          pricing_tier_id?: string | null
          rate_category?: string | null
          rcs?: string | null
          reference?: string | null
          sellsy_client_id?: string | null
          sellsy_created_at?: string | null
          sellsy_id?: string | null
          share_capital?: string | null
          siren?: string | null
          siret?: string | null
          smart_tags?: string[] | null
          subscribed_custom?: boolean | null
          subscribed_email?: boolean | null
          subscribed_mail?: boolean | null
          subscribed_phone?: boolean | null
          subscribed_sms?: boolean | null
          third_party_account?: string | null
          type?: string | null
          updated_at?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          admin_notes?: string | null
          archived?: boolean | null
          auxiliary_account?: string | null
          client_data_mode?: string
          coffee_type?: string | null
          company_type?: string | null
          created_at?: string | null
          current_step?: number | null
          delivery_instructions?: string | null
          delivery_time_window?: string | null
          email?: string | null
          employee_count?: string | null
          estimated_weekly_volume?: number | null
          fax?: string | null
          grinder_type?: string | null
          id?: string
          last_synced_at?: string | null
          legal_company_name?: string | null
          legal_form?: string | null
          min_order_kg?: number | null
          mobile?: string | null
          naf_code?: string | null
          name?: string
          notes?: string | null
          onboarding_status?: string | null
          owner?: string | null
          payment_terms?: string | null
          phone?: string | null
          preferred_delivery_days?: string[] | null
          pricing_tier_id?: string | null
          rate_category?: string | null
          rcs?: string | null
          reference?: string | null
          sellsy_client_id?: string | null
          sellsy_created_at?: string | null
          sellsy_id?: string | null
          share_capital?: string | null
          siren?: string | null
          siret?: string | null
          smart_tags?: string[] | null
          subscribed_custom?: boolean | null
          subscribed_email?: boolean | null
          subscribed_mail?: boolean | null
          subscribed_phone?: boolean | null
          subscribed_sms?: boolean | null
          third_party_account?: string | null
          type?: string | null
          updated_at?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_pricing_tier_id_fkey"
            columns: ["pricing_tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_addresses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          address_line3: string | null
          address_line4: string | null
          city: string | null
          company_id: string
          country_code: string | null
          created_at: string | null
          id: string
          label: string | null
          postal_code: string | null
          sellsy_address_id: string | null
          state_province: string | null
          updated_at: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          address_line4?: string | null
          city?: string | null
          company_id: string
          country_code?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          postal_code?: string | null
          sellsy_address_id?: string | null
          state_province?: string | null
          updated_at?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          address_line4?: string | null
          city?: string | null
          company_id?: string
          country_code?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          postal_code?: string | null
          sellsy_address_id?: string | null
          state_province?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          archived: boolean | null
          civility: string | null
          company_id: string | null
          created_at: string | null
          email: string | null
          fax: string | null
          first_name: string | null
          id: string
          is_billing: boolean | null
          is_dunning: boolean | null
          is_primary: boolean | null
          job_title: string | null
          last_name: string
          mobile: string | null
          notes: string | null
          phone: string | null
          sellsy_contact_id: string | null
          smart_tags: string[] | null
          subscribed_custom: boolean | null
          subscribed_email: boolean | null
          subscribed_mail: boolean | null
          subscribed_phone: boolean | null
          subscribed_sms: boolean | null
          updated_at: string | null
          user_id: string | null
          website: string | null
        }
        Insert: {
          archived?: boolean | null
          civility?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          fax?: string | null
          first_name?: string | null
          id?: string
          is_billing?: boolean | null
          is_dunning?: boolean | null
          is_primary?: boolean | null
          job_title?: string | null
          last_name: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          sellsy_contact_id?: string | null
          smart_tags?: string[] | null
          subscribed_custom?: boolean | null
          subscribed_email?: boolean | null
          subscribed_mail?: boolean | null
          subscribed_phone?: boolean | null
          subscribed_sms?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
        }
        Update: {
          archived?: boolean | null
          civility?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          fax?: string | null
          first_name?: string | null
          id?: string
          is_billing?: boolean | null
          is_dunning?: boolean | null
          is_primary?: boolean | null
          job_title?: string | null
          last_name?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          sellsy_contact_id?: string | null
          smart_tags?: string[] | null
          subscribed_custom?: boolean | null
          subscribed_email?: boolean | null
          subscribed_mail?: boolean | null
          subscribed_phone?: boolean | null
          subscribed_sms?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          grind_type: string | null
          id: string
          order_id: string
          price_per_kg: number
          product_id: string | null
          product_name: string
          product_sku: string | null
          product_variant_id: string | null
          quantity: number
          size_kg: number | null
          size_label: string | null
        }
        Insert: {
          created_at?: string
          grind_type?: string | null
          id?: string
          order_id: string
          price_per_kg?: number
          product_id?: string | null
          product_name: string
          product_sku?: string | null
          product_variant_id?: string | null
          quantity?: number
          size_kg?: number | null
          size_label?: string | null
        }
        Update: {
          created_at?: string
          grind_type?: string | null
          id?: string
          order_id?: string
          price_per_kg?: number
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          product_variant_id?: string | null
          quantity?: number
          size_kg?: number | null
          size_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          order_id: string
          status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          order_id: string
          status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_name: string | null
          company_id: string | null
          confirmed_at: string | null
          created_at: string
          delivery_address_id: string | null
          delivery_date: string
          delivery_discount_percent: number
          discount_percent: number
          exported_to_sheet_at: string | null
          id: string
          invoiced_at: string | null
          invoicing_status: string
          is_labeled: boolean
          is_packed: boolean
          is_roasted: boolean
          last_invoice_sync: string | null
          notes: string | null
          pricing_tier_name: string | null
          reordered_from: string | null
          sellsy_id: string | null
          sellsy_invoice_error: string | null
          sellsy_invoice_id: string | null
          sellsy_invoice_status: string
          status: string
          total_kg: number
          total_price: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_name?: string | null
          company_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivery_address_id?: string | null
          delivery_date: string
          delivery_discount_percent?: number
          discount_percent?: number
          exported_to_sheet_at?: string | null
          id?: string
          invoiced_at?: string | null
          invoicing_status?: string
          is_labeled?: boolean
          is_packed?: boolean
          is_roasted?: boolean
          last_invoice_sync?: string | null
          notes?: string | null
          pricing_tier_name?: string | null
          reordered_from?: string | null
          sellsy_id?: string | null
          sellsy_invoice_error?: string | null
          sellsy_invoice_id?: string | null
          sellsy_invoice_status?: string
          status?: string
          total_kg?: number
          total_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_name?: string | null
          company_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivery_address_id?: string | null
          delivery_date?: string
          delivery_discount_percent?: number
          discount_percent?: number
          exported_to_sheet_at?: string | null
          id?: string
          invoiced_at?: string | null
          invoicing_status?: string
          is_labeled?: boolean
          is_packed?: boolean
          is_roasted?: boolean
          last_invoice_sync?: string | null
          notes?: string | null
          pricing_tier_name?: string | null
          reordered_from?: string | null
          sellsy_id?: string | null
          sellsy_invoice_error?: string | null
          sellsy_invoice_id?: string | null
          sellsy_invoice_status?: string
          status?: string
          total_kg?: number
          total_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "company_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reordered_from_fkey"
            columns: ["reordered_from"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_tiers: {
        Row: {
          created_at: string
          delivery_discount_percent: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          product_discount_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_discount_percent?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          product_discount_percent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_discount_percent?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          product_discount_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          price: number
          product_id: string
          sellsy_declination_id: number | null
          size_kg: number
          size_label: string
          sku: string | null
          source: string
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          price?: number
          product_id: string
          sellsy_declination_id?: number | null
          size_kg: number
          size_label: string
          sku?: string | null
          source?: string
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          price?: number
          product_id?: string
          sellsy_declination_id?: number | null
          size_kg?: number
          size_label?: string
          sku?: string | null
          source?: string
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          custom_name: string | null
          custom_price_per_kg: number | null
          data_source_mode: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          origin: string | null
          price_per_kg: number
          process: string | null
          roast_level: string | null
          sellsy_id: string | null
          sellsy_tax_id: string | null
          sellsy_tax_rate: number | null
          shopify_product_id: string | null
          shopify_synced_at: string | null
          shopify_variant_id: string | null
          sku: string | null
          source: string
          synced_at: string
          tags: string[] | null
          tasting_notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          custom_price_per_kg?: number | null
          data_source_mode?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          origin?: string | null
          price_per_kg?: number
          process?: string | null
          roast_level?: string | null
          sellsy_id?: string | null
          sellsy_tax_id?: string | null
          sellsy_tax_rate?: number | null
          shopify_product_id?: string | null
          shopify_synced_at?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          source?: string
          synced_at?: string
          tags?: string[] | null
          tasting_notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          custom_price_per_kg?: number | null
          data_source_mode?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          origin?: string | null
          price_per_kg?: number
          process?: string | null
          roast_level?: string | null
          sellsy_id?: string | null
          sellsy_tax_id?: string | null
          sellsy_tax_rate?: number | null
          shopify_product_id?: string | null
          shopify_synced_at?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          source?: string
          synced_at?: string
          tags?: string[] | null
          tasting_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      roasted_stock: {
        Row: {
          created_at: string | null
          id: string
          last_updated_at: string | null
          last_updated_by: string | null
          low_stock_threshold_kg: number
          product_id: string | null
          quantity_kg: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_updated_at?: string | null
          last_updated_by?: string | null
          low_stock_threshold_kg?: number
          product_id?: string | null
          quantity_kg?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          last_updated_at?: string | null
          last_updated_by?: string | null
          low_stock_threshold_kg?: number
          product_id?: string | null
          quantity_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "roasted_stock_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roasted_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      roasted_stock_history: {
        Row: {
          change_type: string
          delta_kg: number
          id: string
          new_quantity_kg: number
          note: string | null
          order_id: string | null
          previous_quantity_kg: number
          stock_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          change_type: string
          delta_kg: number
          id?: string
          new_quantity_kg: number
          note?: string | null
          order_id?: string | null
          previous_quantity_kg: number
          stock_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          change_type?: string
          delta_kg?: number
          id?: string
          new_quantity_kg?: number
          note?: string | null
          order_id?: string | null
          previous_quantity_kg?: number
          stock_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roasted_stock_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roasted_stock_history_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "roasted_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roasted_stock_history_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_exports: {
        Row: {
          created_at: string
          id: string
          last_exported_at: string
          month_key: string
          orders_count: number
          spreadsheet_id: string
          spreadsheet_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_exported_at?: string
          month_key: string
          orders_count?: number
          spreadsheet_id: string
          spreadsheet_url: string
        }
        Update: {
          created_at?: string
          id?: string
          last_exported_at?: string
          month_key?: string
          orders_count?: number
          spreadsheet_id?: string
          spreadsheet_url?: string
        }
        Relationships: []
      }
      shopify_orders: {
        Row: {
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          line_items: Json
          raw_payload: Json | null
          received_at: string | null
          shopify_order_id: string
          shopify_order_number: string | null
          synced_to_order_id: string | null
          total_price: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          line_items?: Json
          raw_payload?: Json | null
          received_at?: string | null
          shopify_order_id: string
          shopify_order_number?: string | null
          synced_to_order_id?: string | null
          total_price?: number | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          line_items?: Json
          raw_payload?: Json | null
          received_at?: string | null
          shopify_order_id?: string
          shopify_order_number?: string | null
          synced_to_order_id?: string | null
          total_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_orders_synced_to_order_id_fkey"
            columns: ["synced_to_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_health_logs: {
        Row: {
          checked_at: string
          details: Json | null
          google_sheets_status: string
          id: string
          overall_status: string
          sellsy_status: string
          shopify_status: string
          supabase_status: string
          triggered_by: string | null
        }
        Insert: {
          checked_at?: string
          details?: Json | null
          google_sheets_status: string
          id?: string
          overall_status: string
          sellsy_status: string
          shopify_status: string
          supabase_status: string
          triggered_by?: string | null
        }
        Update: {
          checked_at?: string
          details?: Json | null
          google_sheets_status?: string
          id?: string
          overall_status?: string
          sellsy_status?: string
          shopify_status?: string
          supabase_status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          completed_at: string
          created_at: string
          created_by: string
          id: string
          parse_errors: Json
          source: string
          started_at: string
          status: string
          sync_type: string
          synced_count: number
          updated_at: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          created_by: string
          id?: string
          parse_errors?: Json
          source: string
          started_at?: string
          status?: string
          sync_type: string
          synced_count?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          created_by?: string
          id?: string
          parse_errors?: Json
          source?: string
          started_at?: string
          status?: string
          sync_type?: string
          synced_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          invited_at: string | null
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_order_with_items:
        | {
            Args: {
              p_confirmed_at?: string
              p_delivery_address_id?: string
              p_delivery_date: string
              p_items?: Json
              p_notes?: string
              p_reordered_from?: string
              p_status?: string
              p_total_kg: number
              p_total_price: number
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_confirmed_at: string
              p_delivery_date: string
              p_items: Json
              p_notes: string
              p_status: string
              p_total_kg: number
              p_total_price: number
              p_user_id: string
            }
            Returns: Json
          }
      ensure_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_my_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_save_onboarding_progress:
        | {
            Args: {
              _coffee_type?: string
              _company_name?: string
              _contact_name?: string
              _current_step?: number
              _delivery_address?: string
              _delivery_instructions?: string
              _delivery_time_window?: string
              _email?: string
              _estimated_weekly_volume?: number
              _grinder_type?: string
              _legal_company_name?: string
              _notes?: string
              _onboarding_status?: string
              _phone?: string
              _preferred_delivery_days?: string[]
              _siret?: string
              _vat_number?: string
            }
            Returns: Json
          }
        | {
            Args: {
              _coffee_type?: string
              _company_name?: string
              _current_step?: number
              _delivery_address?: string
              _delivery_instructions?: string
              _delivery_time_window?: string
              _email?: string
              _estimated_weekly_volume?: number
              _grinder_type?: string
              _legal_company_name?: string
              _notes?: string
              _onboarding_status?: string
              _phone?: string
              _preferred_delivery_days?: string[]
              _siret?: string
              _vat_number?: string
            }
            Returns: Json
          }
      user_update_own_onboarding: {
        Args: {
          _coffee_type?: string
          _company_name?: string
          _contact_name?: string
          _current_step?: number
          _custom_company_name?: string
          _custom_contact_name?: string
          _custom_delivery_address?: string
          _custom_email?: string
          _custom_phone?: string
          _delivery_address?: string
          _delivery_instructions?: string
          _delivery_time_window?: string
          _email?: string
          _estimated_weekly_volume?: number
          _grinder_type?: string
          _id: string
          _legal_company_name?: string
          _notes?: string
          _onboarding_status?: string
          _phone?: string
          _preferred_delivery_days?: string[]
          _siret?: string
          _vat_number?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "roaster" | "packaging"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "roaster", "packaging"],
    },
  },
} as const
