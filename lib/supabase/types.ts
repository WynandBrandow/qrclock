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
      clock_events: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
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
          replaces_id: string | null
          source: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
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
          replaces_id?: string | null
          source: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
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
          duplicate_window_seconds: number
          id: string
          long_shift_hours: number
          name: string
          record_location: boolean
          timezone: string
          track_breaks: boolean
          week_start: number
        }
        Insert: {
          breaks_paid?: boolean
          created_at?: string
          duplicate_window_seconds?: number
          id?: string
          long_shift_hours?: number
          name: string
          record_location?: boolean
          timezone?: string
          track_breaks?: boolean
          week_start?: number
        }
        Update: {
          breaks_paid?: boolean
          created_at?: string
          duplicate_window_seconds?: number
          id?: string
          long_shift_hours?: number
          name?: string
          record_location?: boolean
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
          full_name: string
          id: string
          pin_failed_count: number
          pin_hash: string | null
          pin_locked_until: string | null
          qr_issued_at: string
          qr_token: string
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          pin_failed_count?: number
          pin_hash?: string | null
          pin_locked_until?: string | null
          qr_issued_at?: string
          qr_token?: string
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          pin_failed_count?: number
          pin_hash?: string | null
          pin_locked_until?: string | null
          qr_issued_at?: string
          qr_token?: string
          role?: string
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
          company_id: string
          created_at: string
          device_secret_hash: string | null
          id: string
          last_seen_at: string | null
          location_id: string | null
          name: string
          paired_at: string | null
          pairing_code_hash: string | null
          pairing_expires_at: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          device_secret_hash?: string | null
          id?: string
          last_seen_at?: string | null
          location_id?: string | null
          name: string
          paired_at?: string | null
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          device_secret_hash?: string | null
          id?: string
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
          name: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
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
      weekly_timesheets: {
        Row: {
          approved_at: string
          approved_by: string
          break_minutes: number
          company_id: string
          employee_id: string
          id: string
          shift_count: number
          week_start: string
          worked_minutes: number
        }
        Insert: {
          approved_at?: string
          approved_by: string
          break_minutes: number
          company_id: string
          employee_id: string
          id?: string
          shift_count: number
          week_start: string
          worked_minutes: number
        }
        Update: {
          approved_at?: string
          approved_by?: string
          break_minutes?: number
          company_id?: string
          employee_id?: string
          id?: string
          shift_count?: number
          week_start?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_timesheets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_timesheets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_timesheets_employee_id_fkey"
            columns: ["employee_id"]
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
          p_reason: string
        }
        Returns: string
      }
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
      record_punch: {
        Args: {
          p_employee_id: string
          p_kind: string
          p_kiosk_id?: string
          p_source: string
        }
        Returns: Json
      }
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
