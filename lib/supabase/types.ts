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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_errors: {
        Row: {
          created_at: string
          digest: string | null
          id: number
          message: string
          method: string | null
          path: string | null
        }
        Insert: {
          created_at?: string
          digest?: string | null
          id?: never
          message: string
          method?: string | null
          path?: string | null
        }
        Update: {
          created_at?: string
          digest?: string | null
          id?: never
          message?: string
          method?: string | null
          path?: string | null
        }
        Relationships: []
      }
      clock_events: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          distance_m: number | null
          employee_id: string
          flag: string | null
          flag_note: string | null
          flag_resolved_at: string | null
          flag_resolved_by: string | null
          id: string
          kind: string
          kiosk_id: string | null
          location_id: string | null
          occurred_at: string
          paid_break: boolean | null
          replaces_id: string | null
          source: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          distance_m?: number | null
          employee_id: string
          flag?: string | null
          flag_note?: string | null
          flag_resolved_at?: string | null
          flag_resolved_by?: string | null
          id?: string
          kind: string
          kiosk_id?: string | null
          location_id?: string | null
          occurred_at: string
          paid_break?: boolean | null
          replaces_id?: string | null
          source: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          distance_m?: number | null
          employee_id?: string
          flag?: string | null
          flag_note?: string | null
          flag_resolved_at?: string | null
          flag_resolved_by?: string | null
          id?: string
          kind?: string
          kiosk_id?: string | null
          location_id?: string | null
          occurred_at?: string
          paid_break?: boolean | null
          replaces_id?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_flag_resolved_by_fkey"
            columns: ["flag_resolved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_kiosk_id_fkey"
            columns: ["kiosk_id"]
            isOneToOne: false
            referencedRelation: "kiosks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_events_replaces_id_fkey"
            columns: ["replaces_id"]
            isOneToOne: false
            referencedRelation: "clock_events"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          breaks_paid: boolean
          created_at: string
          daily_summary: boolean
          duplicate_window_seconds: number
          id: string
          long_shift_hours: number
          meal_break_after_hours: number
          min_meal_break_minutes: number
          name: string
          phone_clocking: boolean
          phone_require_location: boolean
          phone_require_passkey: boolean
          record_location: boolean
          rest_breaks: boolean
          timezone: string
          track_breaks: boolean
          week_start: number
        }
        Insert: {
          breaks_paid?: boolean
          created_at?: string
          daily_summary?: boolean
          duplicate_window_seconds?: number
          id?: string
          long_shift_hours?: number
          meal_break_after_hours?: number
          min_meal_break_minutes?: number
          name: string
          phone_clocking?: boolean
          phone_require_location?: boolean
          phone_require_passkey?: boolean
          record_location?: boolean
          rest_breaks?: boolean
          timezone?: string
          track_breaks?: boolean
          week_start?: number
        }
        Update: {
          breaks_paid?: boolean
          created_at?: string
          daily_summary?: boolean
          duplicate_window_seconds?: number
          id?: string
          long_shift_hours?: number
          meal_break_after_hours?: number
          min_meal_break_minutes?: number
          name?: string
          phone_clocking?: boolean
          phone_require_location?: boolean
          phone_require_passkey?: boolean
          record_location?: boolean
          rest_breaks?: boolean
          timezone?: string
          track_breaks?: boolean
          week_start?: number
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          email: string | null
          employment_type: string | null
          full_name: string
          id: string
          payroll_code: string | null
          phone: string | null
          pin_failed_count: number
          pin_hash: string | null
          pin_lock_count: number
          pin_locked_until: string | null
          pin_version: number
          qr_issued_at: string
          qr_token: string
          role: string
          start_date: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          email?: string | null
          employment_type?: string | null
          full_name: string
          id?: string
          payroll_code?: string | null
          phone?: string | null
          pin_failed_count?: number
          pin_hash?: string | null
          pin_lock_count?: number
          pin_locked_until?: string | null
          pin_version?: number
          qr_issued_at?: string
          qr_token?: string
          role?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          email?: string | null
          employment_type?: string | null
          full_name?: string
          id?: string
          payroll_code?: string | null
          phone?: string | null
          pin_failed_count?: number
          pin_hash?: string | null
          pin_lock_count?: number
          pin_locked_until?: string | null
          pin_version?: number
          qr_issued_at?: string
          qr_token?: string
          role?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_corrections: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          company_id: string
          corrected_at: string
          corrected_by: string
          employee_id: string
          event_time: string | null
          id: string
          new_event_id: string | null
          original_event_id: string | null
          reason: string
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          company_id: string
          corrected_at?: string
          corrected_by: string
          employee_id: string
          event_time?: string | null
          id?: string
          new_event_id?: string | null
          original_event_id?: string | null
          reason: string
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          company_id?: string
          corrected_at?: string
          corrected_by?: string
          employee_id?: string
          event_time?: string | null
          id?: string
          new_event_id?: string | null
          original_event_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_corrections_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_corrections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_corrections_new_event_id_fkey"
            columns: ["new_event_id"]
            isOneToOne: false
            referencedRelation: "clock_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_corrections_original_event_id_fkey"
            columns: ["original_event_id"]
            isOneToOne: false
            referencedRelation: "clock_events"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosks: {
        Row: {
          active: boolean
          client_info: Json | null
          company_id: string
          created_at: string
          device_secret_hash: string | null
          id: string
          last_heartbeat_at: string | null
          last_seen_at: string | null
          location_id: string | null
          name: string
          paired_at: string | null
          pairing_code_hash: string | null
          pairing_expires_at: string | null
        }
        Insert: {
          active?: boolean
          client_info?: Json | null
          company_id: string
          created_at?: string
          device_secret_hash?: string | null
          id?: string
          last_heartbeat_at?: string | null
          last_seen_at?: string | null
          location_id?: string | null
          name: string
          paired_at?: string | null
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
        }
        Update: {
          active?: boolean
          client_info?: Json | null
          company_id?: string
          created_at?: string
          device_secret_hash?: string | null
          id?: string
          last_heartbeat_at?: string | null
          last_seen_at?: string | null
          location_id?: string | null
          name?: string
          paired_at?: string | null
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kiosks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          qr_token: string
          radius_m: number
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          qr_token?: string
          radius_m?: number
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          qr_token?: string
          radius_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      passkeys: {
        Row: {
          company_id: string
          counter: number
          created_at: string
          credential_id: string
          device_label: string | null
          employee_id: string
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[] | null
        }
        Insert: {
          company_id: string
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string | null
          employee_id: string
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[] | null
        }
        Update: {
          company_id?: string
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string | null
          employee_id?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "passkeys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passkeys_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          company_id: string
          date: string
          from_time: string
          id: string
          name: string
          to_time: string
        }
        Insert: {
          company_id: string
          date: string
          from_time?: string
          id?: string
          name: string
          to_time?: string
        }
        Update: {
          company_id?: string
          date?: string
          from_time?: string
          id?: string
          name?: string
          to_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_holidays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_log: {
        Row: {
          company_id: string | null
          created_at: string
          detail: string | null
          employee_id: string | null
          id: number
          kiosk_id: string | null
          result: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          detail?: string | null
          employee_id?: string | null
          id?: never
          kiosk_id?: string | null
          result: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          detail?: string | null
          employee_id?: string | null
          id?: never
          kiosk_id?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_log_kiosk_id_fkey"
            columns: ["kiosk_id"]
            isOneToOne: false
            referencedRelation: "kiosks"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          break_minutes: number
          company_id: string
          content_hash: string
          employee_id: string
          id: string
          minutes_by_category: Json
          period_end: string
          period_start: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          shift_count: number
          worked_minutes: number
        }
        Insert: {
          approved_at?: string
          approved_by: string
          break_minutes: number
          company_id: string
          content_hash: string
          employee_id: string
          id?: string
          minutes_by_category?: Json
          period_end: string
          period_start: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          shift_count: number
          worked_minutes: number
        }
        Update: {
          approved_at?: string
          approved_by?: string
          break_minutes?: number
          company_id?: string
          content_hash?: string
          employee_id?: string
          id?: string
          minutes_by_category?: Json
          period_end?: string
          period_start?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          shift_count?: number
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_approvals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_approvals_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_event: {
        Args: {
          p_by: string
          p_employee_id: string
          p_kind: string
          p_occurred_at: string
          p_paid_break?: boolean
          p_reason: string
        }
        Returns: string
      }
      backdate_test_events: {
        Args: { p_employee_id: string; p_seconds: number }
        Returns: undefined
      }
      call_daily_job: { Args: never; Returns: number }
      correct_event: {
        Args: {
          p_by: string
          p_event_id: string
          p_kind: string
          p_occurred_at: string
          p_reason: string
        }
        Returns: string
      }
      new_token: { Args: never; Returns: string }
      pin_attempt: {
        Args: { p_token: string }
        Returns: {
          employee_id: string
          locked_until: string
          pin_hash: string
          pin_version: number
        }[]
      }
      pin_succeeded: { Args: { p_employee_id: string }; Returns: undefined }
      purge_test_data: {
        Args: { p_company_id?: string; p_employee_id?: string }
        Returns: undefined
      }
      record_punch: {
        Args: {
          p_distance_m?: number
          p_employee_id: string
          p_extra_flag?: string
          p_kind: string
          p_kiosk_id?: string
          p_location_id?: string
          p_paid_break?: boolean
          p_source: string
        }
        Returns: Json
      }
      records_unlocked: { Args: never; Returns: boolean }
      resolve_flag: {
        Args: { p_by: string; p_event_id: string; p_note: string }
        Returns: undefined
      }
      void_event: {
        Args: { p_by: string; p_event_id: string; p_reason: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
