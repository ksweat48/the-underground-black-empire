import { supabase } from '@/shared/supabase-client';
import { isEmpireStageName, type EmpireStageName } from '@/config/progression-rules';

export interface MetroTreasuryCity {
  city_id: string;
  name: string;
  population: number;
  contributed_cents: number;
}

export interface MetroTreasuryRelease {
  amount_cents: number;
  notes: string | null;
  created_at: string;
}

export interface MetroMilestoneEvent {
  event_type: 'qualified' | 'capacity_unlocked';
  capacity_band: number;
  population: number;
  created_at: string;
}

export interface MetroTreasury {
  metro_id: string;
  metro_name: string;
  state: string | null;
  population: number;
  qualified: boolean;
  qualified_at: string | null;
  capacity_band: number;
  capacity_cents: number | null;
  capacity_unlimited: boolean;
  capacity_unlocked_at: string | null;
  next_band: {
    band: number;
    population_threshold: number;
    capacity_cents: number | null;
    members_needed: number;
  } | null;
  total_raised_cents: number;
  total_released_cents: number;
  available_cents: number;
  reserved_cents: number;
  cities: MetroTreasuryCity[];
  releases: MetroTreasuryRelease[];
  milestones: MetroMilestoneEvent[];
}

export interface EmpireGrowthMetro {
  metro_id: string;
  name: string;
  state: string | null;
  population: number;
  qualified: boolean;
  qualified_at: string | null;
  capacity_band: number;
}

export interface EmpireGrowth {
  highest_stage: EmpireStageName;
  stage_reached_at: string | null;
  qualified_metro_count: number;
  total_population: number;
  stage_history: { stage: string; reached_at: string; qualified_metro_count: number }[];
  metros: EmpireGrowthMetro[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function fetchMemberMetroId(memberId: string): Promise<string | null> {
  const { data: member, error } = await supabase
    .from('members')
    .select('city_id')
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  if (!member?.city_id) return null;
  const { data: city, error: cityError } = await supabase
    .from('cities')
    .select('metro_id')
    .eq('id', member.city_id)
    .maybeSingle();
  if (cityError) throw cityError;
  return city?.metro_id ?? null;
}

export async function fetchMetroTreasury(metroId: string): Promise<MetroTreasury | null> {
  const { data, error } = await supabase.rpc('get_metro_treasury', { p_metro_id: metroId });
  if (error) throw error;
  if (!isObject(data) || typeof data.metro_id !== 'string') return null;
  const t = data as unknown as MetroTreasury;
  return {
    ...t,
    cities: Array.isArray(t.cities) ? t.cities : [],
    releases: Array.isArray(t.releases) ? t.releases : [],
    milestones: Array.isArray(t.milestones) ? t.milestones : [],
  };
}

export async function fetchEmpireGrowth(): Promise<EmpireGrowth> {
  const { data, error } = await supabase.rpc('get_empire_growth');
  if (error) throw error;
  if (!isObject(data)) throw new Error('Empire growth unavailable');
  const g = data as unknown as EmpireGrowth;
  return {
    ...g,
    highest_stage: isEmpireStageName(g.highest_stage) ? g.highest_stage : 'outpost',
    qualified_metro_count: g.qualified_metro_count ?? 0,
    total_population: g.total_population ?? 0,
    stage_history: Array.isArray(g.stage_history) ? g.stage_history : [],
    metros: Array.isArray(g.metros) ? g.metros : [],
  };
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}
