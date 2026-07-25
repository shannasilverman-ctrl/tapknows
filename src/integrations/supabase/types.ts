export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      alert_events: {
        Row: {
          alert_id: string | null;
          alert_kind: string | null;
          created_at: string;
          event: string;
          id: string;
          user_id: string;
        };
        Insert: {
          alert_id?: string | null;
          alert_kind?: string | null;
          created_at?: string;
          event: string;
          id?: string;
          user_id: string;
        };
        Update: {
          alert_id?: string | null;
          alert_kind?: string | null;
          created_at?: string;
          event?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alert_events_alert_id_fkey";
            columns: ["alert_id"];
            isOneToOne: false;
            referencedRelation: "alerts";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          action_label: string | null;
          body: string;
          created_at: string;
          dedupe_key: string;
          deep_link: string | null;
          dismissed_at: string | null;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          kind: string;
          opened_at: string | null;
          read_at: string | null;
          scheduled_for: string;
          severity: string;
          title: string;
          user_id: string;
        };
        Insert: {
          action_label?: string | null;
          body?: string;
          created_at?: string;
          dedupe_key: string;
          deep_link?: string | null;
          dismissed_at?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          kind: string;
          opened_at?: string | null;
          read_at?: string | null;
          scheduled_for?: string;
          severity?: string;
          title: string;
          user_id: string;
        };
        Update: {
          action_label?: string | null;
          body?: string;
          created_at?: string;
          dedupe_key?: string;
          deep_link?: string | null;
          dismissed_at?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          kind?: string;
          opened_at?: string | null;
          read_at?: string | null;
          scheduled_for?: string;
          severity?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      cards_catalog: {
        Row: {
          annual_fee: number;
          earn_rules: Json;
          foreign_tx_fee_pct: number;
          id: string;
          is_custom: boolean;
          issuer: string;
          name: string;
          notes: string | null;
          points_program_id: string | null;
          rates_as_of: string;
          user_id: string | null;
        };
        Insert: {
          annual_fee?: number;
          earn_rules?: Json;
          foreign_tx_fee_pct?: number;
          id: string;
          is_custom?: boolean;
          issuer: string;
          name: string;
          notes?: string | null;
          points_program_id?: string | null;
          rates_as_of?: string;
          user_id?: string | null;
        };
        Update: {
          annual_fee?: number;
          earn_rules?: Json;
          foreign_tx_fee_pct?: number;
          id?: string;
          is_custom?: boolean;
          issuer?: string;
          name?: string;
          notes?: string | null;
          points_program_id?: string | null;
          rates_as_of?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cards_catalog_points_program_id_fkey";
            columns: ["points_program_id"];
            isOneToOne: false;
            referencedRelation: "points_programs";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          app_version: string | null;
          chips: string[];
          client_id: string | null;
          created_at: string;
          id: string;
          path: string | null;
          text: string | null;
          user_id: string | null;
        };
        Insert: {
          app_version?: string | null;
          chips?: string[];
          client_id?: string | null;
          created_at?: string;
          id?: string;
          path?: string | null;
          text?: string | null;
          user_id?: string | null;
        };
        Update: {
          app_version?: string | null;
          chips?: string[];
          client_id?: string | null;
          created_at?: string;
          id?: string;
          path?: string | null;
          text?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      merchants_catalog: {
        Row: {
          aliases: string[];
          category: string;
          id: string;
          name: string;
        };
        Insert: {
          aliases?: string[];
          category: string;
          id: string;
          name: string;
        };
        Update: {
          aliases?: string[];
          category?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      points_programs: {
        Row: {
          default_cpp: number;
          id: string;
          kind: string;
          name: string;
        };
        Insert: {
          default_cpp: number;
          id: string;
          kind: string;
          name: string;
        };
        Update: {
          default_cpp?: number;
          id?: string;
          kind?: string;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_benefit_redemptions: {
        Row: {
          benefit_id: string;
          card_catalog_id: string;
          id: string;
          period_key: string;
          redeemed_at: string;
          redeemed_cents: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          benefit_id: string;
          card_catalog_id: string;
          id?: string;
          period_key: string;
          redeemed_at?: string;
          redeemed_cents?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          benefit_id?: string;
          card_catalog_id?: string;
          id?: string;
          period_key?: string;
          redeemed_at?: string;
          redeemed_cents?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_card_accounts: {
        Row: {
          created_at: string;
          credit_limit_cents: number | null;
          current_balance_cents: number | null;
          id: string;
          mask: string | null;
          plaid_account_id: string | null;
          plaid_item_pk: string | null;
          source: string;
          statement_balance_cents: number | null;
          synced_at: string;
          user_card_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credit_limit_cents?: number | null;
          current_balance_cents?: number | null;
          id?: string;
          mask?: string | null;
          plaid_account_id?: string | null;
          plaid_item_pk?: string | null;
          source?: string;
          statement_balance_cents?: number | null;
          synced_at?: string;
          user_card_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credit_limit_cents?: number | null;
          current_balance_cents?: number | null;
          id?: string;
          mask?: string | null;
          plaid_account_id?: string | null;
          plaid_item_pk?: string | null;
          source?: string;
          statement_balance_cents?: number | null;
          synced_at?: string;
          user_card_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_card_accounts_plaid_item_pk_fkey";
            columns: ["plaid_item_pk"];
            isOneToOne: false;
            referencedRelation: "user_plaid_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_card_accounts_user_card_id_fkey";
            columns: ["user_card_id"];
            isOneToOne: false;
            referencedRelation: "user_cards";
            referencedColumns: ["id"];
          },
        ];
      };
      user_cards: {
        Row: {
          annual_fee_paid_at: string | null;
          card_catalog_id: string;
          created_at: string;
          id: string;
          mask: string | null;
          nickname: string | null;
          opened_at: string | null;
          plaid_account_id: string | null;
          plaid_item_id: string | null;
          user_id: string;
          utilization_override_pct: number | null;
        };
        Insert: {
          annual_fee_paid_at?: string | null;
          card_catalog_id: string;
          created_at?: string;
          id?: string;
          mask?: string | null;
          nickname?: string | null;
          opened_at?: string | null;
          plaid_account_id?: string | null;
          plaid_item_id?: string | null;
          user_id: string;
          utilization_override_pct?: number | null;
        };
        Update: {
          annual_fee_paid_at?: string | null;
          card_catalog_id?: string;
          created_at?: string;
          id?: string;
          mask?: string | null;
          nickname?: string | null;
          opened_at?: string | null;
          plaid_account_id?: string | null;
          plaid_item_id?: string | null;
          user_id?: string;
          utilization_override_pct?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_cards_card_catalog_id_fkey";
            columns: ["card_catalog_id"];
            isOneToOne: false;
            referencedRelation: "cards_catalog";
            referencedColumns: ["id"];
          },
        ];
      };
      user_category_spend: {
        Row: {
          cap_cents: number;
          category_key: string;
          id: string;
          quarter: string;
          spend_cents: number;
          updated_at: string;
          user_card_id: string;
          user_id: string;
        };
        Insert: {
          cap_cents: number;
          category_key: string;
          id?: string;
          quarter: string;
          spend_cents?: number;
          updated_at?: string;
          user_card_id: string;
          user_id: string;
        };
        Update: {
          cap_cents?: number;
          category_key?: string;
          id?: string;
          quarter?: string;
          spend_cents?: number;
          updated_at?: string;
          user_card_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_category_spend_user_card_id_fkey";
            columns: ["user_card_id"];
            isOneToOne: false;
            referencedRelation: "user_cards";
            referencedColumns: ["id"];
          },
        ];
      };
      user_cpp_overrides: {
        Row: {
          cpp: number;
          points_program_id: string;
          user_id: string;
        };
        Insert: {
          cpp: number;
          points_program_id: string;
          user_id: string;
        };
        Update: {
          cpp?: number;
          points_program_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_cpp_overrides_points_program_id_fkey";
            columns: ["points_program_id"];
            isOneToOne: false;
            referencedRelation: "points_programs";
            referencedColumns: ["id"];
          },
        ];
      };
      user_daily_active: {
        Row: {
          date: string;
          user_id: string;
        };
        Insert: {
          date: string;
          user_id: string;
        };
        Update: {
          date?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_offers: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          is_used: boolean;
          max_benefit: number | null;
          merchant_catalog_id: string | null;
          merchant_text: string;
          min_spend: number;
          offer_type: string | null;
          reward_type: string;
          reward_value: number;
          user_card_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_used?: boolean;
          max_benefit?: number | null;
          merchant_catalog_id?: string | null;
          merchant_text: string;
          min_spend?: number;
          offer_type?: string | null;
          reward_type: string;
          reward_value: number;
          user_card_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_used?: boolean;
          max_benefit?: number | null;
          merchant_catalog_id?: string | null;
          merchant_text?: string;
          min_spend?: number;
          offer_type?: string | null;
          reward_type?: string;
          reward_value?: number;
          user_card_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_offers_merchant_catalog_id_fkey";
            columns: ["merchant_catalog_id"];
            isOneToOne: false;
            referencedRelation: "merchants_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_offers_user_card_id_fkey";
            columns: ["user_card_id"];
            isOneToOne: false;
            referencedRelation: "user_cards";
            referencedColumns: ["id"];
          },
        ];
      };
      user_plaid_items: {
        Row: {
          created_at: string;
          error_last: string | null;
          id: string;
          institution_name: string | null;
          last_synced_at: string | null;
          needs_attention_at: string | null;
          new_accounts_at: string | null;
          plaid_item_id: string;
          status: string;
          user_id: string;
          webhook_code_last: string | null;
        };
        Insert: {
          created_at?: string;
          error_last?: string | null;
          id?: string;
          institution_name?: string | null;
          last_synced_at?: string | null;
          needs_attention_at?: string | null;
          new_accounts_at?: string | null;
          plaid_item_id: string;
          status?: string;
          user_id: string;
          webhook_code_last?: string | null;
        };
        Update: {
          created_at?: string;
          error_last?: string | null;
          id?: string;
          institution_name?: string | null;
          last_synced_at?: string | null;
          needs_attention_at?: string | null;
          new_accounts_at?: string | null;
          plaid_item_id?: string;
          status?: string;
          user_id?: string;
          webhook_code_last?: string | null;
        };
        Relationships: [];
      };
      user_plaid_items_private: {
        Row: {
          access_token: string;
          created_at: string;
          plaid_item_pk: string;
        };
        Insert: {
          access_token: string;
          created_at?: string;
          plaid_item_pk: string;
        };
        Update: {
          access_token?: string;
          created_at?: string;
          plaid_item_pk?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_plaid_items_private_plaid_item_pk_fkey";
            columns: ["plaid_item_pk"];
            isOneToOne: true;
            referencedRelation: "user_plaid_items";
            referencedColumns: ["id"];
          },
        ];
      };
      user_points_balances: {
        Row: {
          balance: number;
          id: string;
          points_program_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          balance?: number;
          id?: string;
          points_program_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          balance?: number;
          id?: string;
          points_program_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_points_balances_points_program_id_fkey";
            columns: ["points_program_id"];
            isOneToOne: false;
            referencedRelation: "points_programs";
            referencedColumns: ["id"];
          },
        ];
      };
      user_prefs: {
        Row: {
          created_at: string;
          first_decide_at: string | null;
          plaid_last_sync_at: string | null;
          plaid_top_merchants: Json | null;
          priority_preset: string | null;
          priority_values: Json | null;
          recovered_entries: Json | null;
          updated_at: string;
          user_id: string;
          utilization_behavior: string;
          utilization_enabled: boolean;
          utilization_threshold_pct: number;
        };
        Insert: {
          created_at?: string;
          first_decide_at?: string | null;
          plaid_last_sync_at?: string | null;
          plaid_top_merchants?: Json | null;
          priority_preset?: string | null;
          priority_values?: Json | null;
          recovered_entries?: Json | null;
          updated_at?: string;
          user_id: string;
          utilization_behavior?: string;
          utilization_enabled?: boolean;
          utilization_threshold_pct?: number;
        };
        Update: {
          created_at?: string;
          first_decide_at?: string | null;
          plaid_last_sync_at?: string | null;
          plaid_top_merchants?: Json | null;
          priority_preset?: string | null;
          priority_values?: Json | null;
          recovered_entries?: Json | null;
          updated_at?: string;
          user_id?: string;
          utilization_behavior?: string;
          utilization_enabled?: boolean;
          utilization_threshold_pct?: number;
        };
        Relationships: [];
      };
      user_purchases: {
        Row: {
          amount_cents: number;
          category: string | null;
          created_at: string;
          delta_value_cents: number;
          description: string | null;
          id: string;
          merchant_catalog_id: string | null;
          merchant_text: string;
          occurred_at: string;
          recommendation_json: Json | null;
          recommended_user_card_id: string | null;
          user_card_id_used: string | null;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          category?: string | null;
          created_at?: string;
          delta_value_cents?: number;
          description?: string | null;
          id?: string;
          merchant_catalog_id?: string | null;
          merchant_text: string;
          occurred_at?: string;
          recommendation_json?: Json | null;
          recommended_user_card_id?: string | null;
          user_card_id_used?: string | null;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          category?: string | null;
          created_at?: string;
          delta_value_cents?: number;
          description?: string | null;
          id?: string;
          merchant_catalog_id?: string | null;
          merchant_text?: string;
          occurred_at?: string;
          recommendation_json?: Json | null;
          recommended_user_card_id?: string | null;
          user_card_id_used?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_purchases_merchant_catalog_id_fkey";
            columns: ["merchant_catalog_id"];
            isOneToOne: false;
            referencedRelation: "merchants_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_purchases_recommended_user_card_id_fkey";
            columns: ["recommended_user_card_id"];
            isOneToOne: false;
            referencedRelation: "user_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_purchases_user_card_id_used_fkey";
            columns: ["user_card_id_used"];
            isOneToOne: false;
            referencedRelation: "user_cards";
            referencedColumns: ["id"];
          },
        ];
      };
      user_push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_seen_at: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          last_seen_at?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          last_seen_at?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      user_sessions: {
        Row: {
          alert_id: string | null;
          entry_path: string | null;
          entry_source: string;
          id: string;
          last_ping_at: string;
          started_at: string;
          user_id: string;
        };
        Insert: {
          alert_id?: string | null;
          entry_path?: string | null;
          entry_source?: string;
          id?: string;
          last_ping_at?: string;
          started_at?: string;
          user_id: string;
        };
        Update: {
          alert_id?: string | null;
          entry_path?: string | null;
          entry_source?: string;
          id?: string;
          last_ping_at?: string;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_sessions_alert_id_fkey";
            columns: ["alert_id"];
            isOneToOne: false;
            referencedRelation: "alerts";
            referencedColumns: ["id"];
          },
        ];
      };
      user_signup_bonuses: {
        Row: {
          alerts_sent: Json;
          bonus_points: number;
          created_at: string;
          deadline: string;
          id: string;
          spend_required: number;
          spend_so_far: number;
          user_card_id: string;
          user_id: string;
        };
        Insert: {
          alerts_sent?: Json;
          bonus_points: number;
          created_at?: string;
          deadline: string;
          id?: string;
          spend_required: number;
          spend_so_far?: number;
          user_card_id: string;
          user_id: string;
        };
        Update: {
          alerts_sent?: Json;
          bonus_points?: number;
          created_at?: string;
          deadline?: string;
          id?: string;
          spend_required?: number;
          spend_so_far?: number;
          user_card_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_signup_bonuses_user_card_id_fkey";
            columns: ["user_card_id"];
            isOneToOne: false;
            referencedRelation: "user_cards";
            referencedColumns: ["id"];
          },
        ];
      };
      waitlist: {
        Row: {
          created_at: string;
          email: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      enforce_plaid_retention: { Args: never; Returns: undefined };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      migrate_guest_wallet: { Args: { payload: Json }; Returns: Json };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;
