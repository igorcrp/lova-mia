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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      assets_control: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          is_visible: boolean
          stock_code: string
          table_source: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_visible?: boolean
          stock_code: string
          table_source: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_visible?: boolean
          stock_code?: string
          table_source?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          new_values: Json | null
          old_values: Json | null
          operation: string
          table_name: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation: string
          table_name: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation?: string
          table_name?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      br_b3_stocks: {
        Row: {
          close: number | null
          date: string
          high: number | null
          id: number
          low: number | null
          open: number | null
          stock_code: string
          volume: number | null
        }
        Insert: {
          close?: number | null
          date: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code: string
          volume?: number | null
        }
        Update: {
          close?: number | null
          date?: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code?: string
          volume?: number | null
        }
        Relationships: []
      }
      crypto_usd: {
        Row: {
          close: number | null
          date: string
          high: number | null
          id: number
          low: number | null
          open: number | null
          stock_code: string
          volume: number | null
        }
        Insert: {
          close?: number | null
          date: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code: string
          volume?: number | null
        }
        Update: {
          close?: number | null
          date?: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code?: string
          volume?: number | null
        }
        Relationships: []
      }
      market_data_sources: {
        Row: {
          asset_class: string
          country: string
          created_at: string | null
          id: number
          stock_market: string
          stock_table: string
          updated_at: string | null
        }
        Insert: {
          asset_class: string
          country: string
          created_at?: string | null
          id?: number
          stock_market: string
          stock_table: string
          updated_at?: string | null
        }
        Update: {
          asset_class?: string
          country?: string
          created_at?: string | null
          id?: number
          stock_market?: string
          stock_table?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      stock_results: {
        Row: {
          change_percent: number | null
          company_name: string
          created_at: string | null
          dividend_yield: number | null
          id: string
          industry: string | null
          market_cap: number | null
          pe_ratio: number | null
          price: number
          sector: string | null
          symbol: string
          volume: number | null
        }
        Insert: {
          change_percent?: number | null
          company_name: string
          created_at?: string | null
          dividend_yield?: number | null
          id?: string
          industry?: string | null
          market_cap?: number | null
          pe_ratio?: number | null
          price: number
          sector?: string | null
          symbol: string
          volume?: number | null
        }
        Update: {
          change_percent?: number | null
          company_name?: string
          created_at?: string | null
          dividend_yield?: number | null
          id?: string
          industry?: string | null
          market_cap?: number | null
          pe_ratio?: number | null
          price?: number
          sector?: string | null
          symbol?: string
          volume?: number | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      us_nasdaq100_stocks: {
        Row: {
          close: number | null
          date: string
          high: number | null
          id: number
          low: number | null
          open: number | null
          stock_code: string
          volume: number | null
        }
        Insert: {
          close?: number | null
          date: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code: string
          volume?: number | null
        }
        Update: {
          close?: number | null
          date?: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code?: string
          volume?: number | null
        }
        Relationships: []
      }
      us_nasdaqfinancial100_stocks: {
        Row: {
          close: number | null
          date: string
          high: number | null
          id: number
          low: number | null
          open: number | null
          stock_code: string
          volume: number | null
        }
        Insert: {
          close?: number | null
          date: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code: string
          volume?: number | null
        }
        Update: {
          close?: number | null
          date?: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code?: string
          volume?: number | null
        }
        Relationships: []
      }
      us_sp500_stocks: {
        Row: {
          close: number | null
          date: string
          high: number | null
          id: number
          low: number | null
          open: number | null
          stock_code: string
          volume: number | null
        }
        Insert: {
          close?: number | null
          date: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code: string
          volume?: number | null
        }
        Update: {
          close?: number | null
          date?: string
          high?: number | null
          id?: number
          low?: number | null
          open?: number | null
          stock_code?: string
          volume?: number | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          email_verified: boolean | null
          id: string
          level_id: number | null
          name: string | null
          plan_type: string
          role: string | null
          status_users: string | null
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          email_verified?: boolean | null
          id?: string
          level_id?: number | null
          name?: string | null
          plan_type?: string
          role?: string | null
          status_users?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          email_verified?: boolean | null
          id?: string
          level_id?: number | null
          name?: string | null
          plan_type?: string
          role?: string | null
          status_users?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_user_by_email: {
        Args: { p_email: string }
        Returns: {
          level_id: number
          status_users: string
          user_exists: boolean
        }[]
      }
      current_user_level: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_current_user: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          email: string
          email_verified: boolean
          id: string
          level_id: number
          name: string
          plan_type: string
          status_users: string
        }[]
      }
      get_masked_subscriber_data: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          email: string
          id: string
          subscribed: boolean
          subscription_end: string
          subscription_tier: string
          updated_at: string
          user_id: string
        }[]
      }
      get_stock_data: {
        Args:
          | {
              end_date?: string
              start_date?: string
              stock_code_param: string
              table_name: string
            }
          | {
              p_limit_rows?: number
              p_stock_code_param: string
              p_table_name: string
            }
        Returns: Json
      }
      get_unique_stock_codes: {
        Args: { p_table_name: string }
        Returns: string[]
      }
      get_user_subscription_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          subscribed: boolean
          subscription_end: string
          subscription_tier: string
        }[]
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      populate_assets_control: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      table_exists: {
        Args: { p_table_name: string }
        Returns: boolean
      }
      update_user_level_admin_only: {
        Args: { new_level: number; target_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
