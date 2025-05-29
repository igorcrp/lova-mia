export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      asset_class: {
        Row: {
          class: string
          country: string
          created_at: string | null
          id: number
          is_active: boolean | null
          stock_market: string
          table_name: string
          updated_at: string | null
        }
        Insert: {
          class: string
          country: string
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          stock_market: string
          table_name: string
          updated_at?: string | null
        }
        Update: {
          class?: string
          country?: string
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          stock_market?: string
          table_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      br_fii: {
        Row: {
          close: number
          date: string
          high: number
          id: string
          low: number
          open: number
          stock_code: string
          volume: number
        }
        Insert: {
          close: number
          date: string
          high: number
          id?: string
          low: number
          open: number
          stock_code: string
          volume: number
        }
        Update: {
          close?: number
          date?: string
          high?: number
          id?: string
          low?: number
          open?: number
          stock_code?: string
          volume?: number
        }
        Relationships: []
      }
      br_stocks: {
        Row: {
          close: number
          date: string
          high: number
          id: string
          low: number
          open: number
          stock_code: string
          volume: number
        }
        Insert: {
          close: number
          date: string
          high: number
          id?: string
          low: number
          open: number
          stock_code: string
          volume: number
        }
        Update: {
          close?: number
          date?: string
          high?: number
          id?: string
          low?: number
          open?: number
          stock_code?: string
          volume?: number
        }
        Relationships: []
      }
      market_data: {
        Row: {
          active: boolean | null
          classification: string | null
          country: string | null
          created_at: string | null
          id: string
          name: string | null
          stock_code: string
          stock_market: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          classification?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          stock_code: string
          stock_market?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          classification?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          stock_code?: string
          stock_market?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      market_status: {
        Row: {
          id: string
          is_open: boolean | null
          next_close_time: string | null
          next_open_time: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          is_open?: boolean | null
          next_close_time?: string | null
          next_open_time?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          is_open?: boolean | null
          next_close_time?: string | null
          next_open_time?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          account_updates_enabled: boolean
          created_at: string | null
          email_enabled: boolean
          id: string
          market_alerts_enabled: boolean
          promotions_enabled: boolean
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_updates_enabled?: boolean
          created_at?: string | null
          email_enabled?: boolean
          id?: string
          market_alerts_enabled?: boolean
          promotions_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_updates_enabled?: boolean
          created_at?: string | null
          email_enabled?: boolean
          id?: string
          market_alerts_enabled?: boolean
          promotions_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_levels: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          device: string | null
          id: string
          ip_address: string | null
          last_active: string | null
          location: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          device?: string | null
          id?: string
          ip_address?: string | null
          last_active?: string | null
          location?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          device?: string | null
          id?: string
          ip_address?: string | null
          last_active?: string | null
          location?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          auth_id: string | null
          auth_user_id: string | null
          created_at: string | null
          email: string
          email_verified: boolean | null
          id: string
          level_id: number | null
          metadata: Json | null
          name: string | null
          role: string | null
          status_users: string
          updated_at: string | null
        }
        Insert: {
          auth_id?: string | null
          auth_user_id?: string | null
          created_at?: string | null
          email: string
          email_verified?: boolean | null
          id?: string
          level_id?: number | null
          metadata?: Json | null
          name?: string | null
          role?: string | null
          status_users?: string
          updated_at?: string | null
        }
        Update: {
          auth_id?: string | null
          auth_user_id?: string | null
          created_at?: string | null
          email?: string
          email_verified?: boolean | null
          id?: string
          level_id?: number | null
          metadata?: Json | null
          name?: string | null
          role?: string | null
          status_users?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "user_levels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_fii_unique: {
        Row: {
          close: number | null
          date: string | null
          high: number | null
          low: number | null
          open: number | null
          stock_code: string | null
          volume: number | null
        }
        Relationships: []
      }
      v_stocks_unique: {
        Row: {
          close: number | null
          date: string | null
          high: number | null
          low: number | null
          open: number | null
          stock_code: string | null
          volume: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_user_active_status: {
        Args: { user_auth_id: string }
        Returns: boolean
      }
      create_asset_class_table: {
        Args: { p_table_name: string }
        Returns: undefined
      }
      delete_asset_from_table: {
        Args: { p_table_name: string; p_stock_code: string }
        Returns: undefined
      }
      delete_users_supabase: {
        Args: { user_id: string }
        Returns: undefined
      }
      format_number: {
        Args: { num: number }
        Returns: string
      }
      get_asset_classes: {
        Args: { p_country: string; p_stock_market: string }
        Returns: {
          class: string
        }[]
      }
      get_assets_by_class: {
        Args: { class_type: string }
        Returns: {
          id: string
          ticker: string
          name: string
        }[]
      }
      get_br_stock_data: {
        Args: { p_stock_code: string; p_start_date: string; p_end_date: string }
        Returns: {
          date: string
          stock_code: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          asset_class_id: number
          updated_at: string
        }[]
      }
      get_product_inventory: {
        Args: Record<PropertyKey, never>
        Returns: {
          product_id: number
          product_name: string
          stock_quantity: number
          last_updated: string
        }[]
      }
      get_stock_data_by_class: {
        Args: {
          p_stock_code: string
          p_classification: string
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          date: string
          open: number
          high: number
          low: number
          close: number
          volume: number
        }[]
      }
      get_stock_markets_by_country: {
        Args: { p_country: string }
        Returns: {
          stock_market: string
        }[]
      }
      get_stock_price_history: {
        Args: {
          p_stock_code: string
          p_classification: string
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          date: string
          open: number
          high: number
          low: number
          close: number
          volume: number
        }[]
      }
      get_stock_tickers_by_class: {
        Args: { class_type: string }
        Returns: {
          id: string
          ticker: string
          name: string
        }[]
      }
      get_unique_stock_codes: {
        Args: { p_table_name: string }
        Returns: string[]
      }
      get_unique_stock_data: {
        Args: { p_stock_code: string; p_start_date: string; p_end_date: string }
        Returns: {
          date: string
          stock_code: string
          open: number
          high: number
          low: number
          close: number
          volume: number
          asset_class_id: number
        }[]
      }
      insert_asset_into_table: {
        Args: {
          p_table_name: string
          p_stock_code: string
          p_name: string
          p_date: string
          p_open: number
          p_high: number
          p_low: number
          p_close: number
          p_volume: number
        }
        Returns: undefined
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      promote_to_admin: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      table_exists: {
        Args: { p_table_name: string }
        Returns: boolean
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const