import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, UnderlineTabs } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Stats = {
  people: number; people_7d: number; people_today: number;
  reviews: number; reviews_7d: number; reviews_today: number;
  photos: number; likes: number; comments: number; active_7d: number; open_reports: number;
  per_day: { day: string; reviews: number; people: number }[];
  top_people: { username: string; reviews: number }[];
  top_places: { name: string; reviews: number }[];
};
type Report = {
  report_id: string; kind: 'review' | 'comment'; reported_at: string; reason: string; reported_by: string;
  author: string | null; target_id: string; review_id: string | null; dish: string | null; body: string | null; reports: number;
};
// How the menu finder looked for restaurant websites (see the lookup counts migration).
type Lookup = {
  service: 'osm' | 'google' | 'search'; used: number; found: number;
  used_last_month: number; found_last_month: number; cap: number | null;
};
const LOOKUP_NAME: Record<Lookup['service'], string> = { osm: 'OpenStreetMap', google: 'Google', search: 'Web search' };
const GOOGLE_FREE = 1000; // Google's free lookups a month; each one over costs about 2.7p
// Roughly what a month's lookups cost, in pounds.
function lookupCost(l: Lookup) {
  if (l.service === 'osm') return 'Free';
  if (l.service === 'google') return l.used <= GOOGLE_FREE ? 'Free (under 1,000)' : `About £${((l.used - GOOGLE_FREE) * 0.027).toFixed(2)}`;
  return `About £${(l.used * 0.015).toFixed(2)}`;
}

type MenuReport = {
  restaurant_id: string; restaurant: string; postcode: string | null; problems: string[]; reports: number;
  last_reported: string; reported_by: string | null;
};

// The team's private page: how Foodalise is doing, reported posts to keep or remove,
// and menus diners say are wrong. Only admins can open it (see the dashboard migration).
export default function Dashboard() {
  const t = useTheme();
  const [view, setView] = useState<'numbers' | 'reports' | 'menus'>('numbers');
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [menus, setMenus] = useState<MenuReport[]>([]);
  const [lookups, setLookups] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [s, r, m, l] = await Promise.all([supabase.rpc('admin_stats'), supabase.rpc('admin_reports'), supabase.rpc('admin_menu_reports'), supabase.rpc('admin_lookups')]);
    if (s.error) { setError(/not allowed/i.test(s.error.message) ? "This page is only for the Foodalise team." : s.error.message); return; }
    setError(null);
    setStats(s.data as Stats);
    // Several reports about the same post show once.
    const seen = new Set<string>();
    setReports(((r.data as Report[] | null) ?? []).filter((x) => !seen.has(x.target_id) && !!seen.add(x.target_id)));
    setMenus((m.data as MenuReport[] | null) ?? []);
    setLookups((l.data as Lookup[] | null) ?? []);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function act(r: Report) {
    Alert.alert(r.kind === 'review' ? 'Reported review' : 'Reported comment', r.body ?? '', [
      ...(r.review_id ? [{ text: 'Open it', onPress: () => router.push({ pathname: '/comments/[id]', params: { id: r.review_id! } }) }] : []),
      { text: 'Keep it (dismiss)', onPress: async () => { await supabase.rpc('admin_dismiss', { kind: r.kind, target: r.target_id }); load(); } },
      { text: 'Remove it', style: 'destructive', onPress: () => Alert.alert('Remove for good?', "This can't be undone.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => { await supabase.rpc('admin_remove', { kind: r.kind, target: r.target_id }); load(); } },
      ]) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // Open the restaurant to check its menu (you can refresh it there as often as you like),
  // or clear the reports once it's sorted.
  function actOnMenu(m: MenuReport) {
    Alert.alert(m.restaurant, m.problems.join('\n'), [
      { text: 'Open restaurant', onPress: () => router.push({ pathname: '/restaurant/[id]', params: { id: m.restaurant_id } }) },
      { text: 'Sorted (clear reports)', onPress: async () => { await supabase.rpc('admin_clear_menu_reports', { place: m.restaurant_id }); load(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // Change the monthly limit for Google or web search. 0 switches it off.
  function changeLimit(l: Lookup) {
    if (l.service === 'osm') return;
    const save = async (cap: number) => {
      const { error: e } = await supabase.rpc('admin_set_lookup_limit', { service: l.service, monthly_cap: cap });
      if (e) Alert.alert("Couldn't change the limit", e.message);
      else load();
    };
    Alert.prompt(`${LOOKUP_NAME[l.service]} monthly limit`,
      l.service === 'google'
        ? 'Lookups a month. Up to 1,000 are free; each one over costs about 2.7p. 0 switches Google off.'
        : 'Searches a month, about 1.5p each (250 is about £4). 0 switches web search off.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save', onPress: (value?: string) => {
            const cap = Number((value ?? '').replace(/[^\d]/g, ''));
            if (!value?.trim() || !Number.isFinite(cap)) return;
            if (l.service === 'google' && cap > GOOGLE_FREE) {
              Alert.alert('Google will charge for this', `Anything over 1,000 a month costs about 2.7p each, so up to about £${((cap - GOOGLE_FREE) * 0.027).toFixed(2)} a month.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Set it', onPress: () => save(cap) },
              ]);
            } else save(cap);
          },
        },
      ], 'plain-text', String(l.cap ?? ''), 'number-pad');
  }

  if (error) return <View style={{ flex: 1, backgroundColor: t.surface }}><Empty title={error} /></View>;

  const max = Math.max(1, ...(stats?.per_day ?? []).map((d) => d.reviews));
  return (
    <ScrollView style={{ backgroundColor: t.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.muted} />}>
      <UnderlineTabs value={view} onChange={setView}
        options={[
          { value: 'numbers', label: 'Numbers' },
          { value: 'reports', label: `Reports${reports.length ? ` (${reports.length})` : ''}` },
          { value: 'menus', label: `Menus${menus.length ? ` (${menus.length})` : ''}` },
        ]} />

      {view === 'numbers' && stats ? (
        <>
          <View style={styles.grid}>
            {([
              ['People', stats.people, `+${stats.people_7d} this week · +${stats.people_today} today`],
              ['Reviews', stats.reviews, `+${stats.reviews_7d} this week · +${stats.reviews_today} today`],
              ['Active this week', stats.active_7d, 'people who posted'],
              ['Photos', stats.photos, `${stats.likes} yums · ${stats.comments} comments`],
            ] as const).map(([label, n, sub]) => (
              <View key={label} style={[styles.tile, { backgroundColor: t.card, borderColor: t.line }]}>
                <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
                <Text style={{ color: t.ink, fontSize: 28, fontWeight: '800' }}>{n}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{sub}</Text>
              </View>
            ))}
          </View>

          {lookups.length ? (
            <View style={[styles.box, { backgroundColor: t.card, borderColor: t.line }]}>
              <Text style={[styles.heading, { color: t.ink }]}>Finding restaurant websites this month</Text>
              {lookups.map((l) => (
                <Pressable key={l.service} disabled={l.service === 'osm'} onPress={() => changeLimit(l)}
                  style={({ pressed }) => [styles.lookup, { borderTopColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: t.ink, fontWeight: '700' }}>{LOOKUP_NAME[l.service]}</Text>
                    <Text style={{ color: t.ink }}>
                      {l.used}{l.cap != null ? ` of ${l.cap}` : ''} {l.used === 1 ? 'lookup' : 'lookups'} · {l.found} found
                    </Text>
                    <Text style={{ color: t.muted, fontSize: 12 }}>
                      {lookupCost(l)} · last month {l.used_last_month} ({l.found_last_month} found)
                    </Text>
                  </View>
                  {l.service !== 'osm' ? <Text style={{ color: t.accent, fontWeight: '700' }}>Change limit</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={[styles.box, { backgroundColor: t.card, borderColor: t.line }]}>
            <Text style={[styles.heading, { color: t.ink }]}>Reviews per day, last 14 days</Text>
            <View style={styles.chart}>
              {stats.per_day.map((d) => (
                <View key={d.day} style={styles.barCol}>
                  <Text style={{ color: t.muted, fontSize: 10 }}>{d.reviews || ''}</Text>
                  <View style={{ width: '70%', height: Math.max(2, (90 * d.reviews) / max), borderRadius: 3, backgroundColor: t.accent }} />
                  <Text style={{ color: t.muted, fontSize: 9 }}>{new Date(d.day).getDate()}</Text>
                </View>
              ))}
            </View>
          </View>

          {([['Most active this week', stats.top_people.map((p) => [`@${p.username}`, p.reviews])],
            ['Most reviewed places', stats.top_places.map((p) => [p.name, p.reviews])]] as const).map(([heading, rows]) => (
            <View key={heading} style={[styles.box, { backgroundColor: t.card, borderColor: t.line }]}>
              <Text style={[styles.heading, { color: t.ink }]}>{heading}</Text>
              {rows.length ? rows.map(([name, n], i) => (
                <View key={`${name}${i}`} style={styles.row}>
                  <Text style={{ color: t.ink, flex: 1 }} numberOfLines={1}>{i + 1}. {name}</Text>
                  <Text style={{ color: t.muted }}>{n} {n === 1 ? 'review' : 'reviews'}</Text>
                </View>
              )) : <Text style={{ color: t.muted }}>Nothing yet.</Text>}
            </View>
          ))}
        </>
      ) : null}

      {view === 'reports' ? (
        reports.length ? reports.map((r) => (
          <Pressable key={r.report_id} onPress={() => act(r)}
            style={({ pressed }) => [styles.box, { backgroundColor: t.card, borderColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
            <Text style={{ color: t.lo, fontWeight: '700' }}>
              {r.reason}{r.reports > 1 ? ` · reported ${r.reports} times` : ''}
            </Text>
            <Text style={{ color: t.ink }} numberOfLines={3}>
              {r.kind === 'comment' ? 'Comment' : 'Review'} by @{r.author ?? 'deleted'}{r.dish ? ` on ${r.dish}` : ''}: {r.body || '(no text, photo only)'}
            </Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>Reported by @{r.reported_by} · {new Date(r.reported_at).toLocaleDateString('en-GB')}</Text>
          </Pressable>
        )) : <Empty title="No reports" body="Nothing has been reported. Reported reviews and comments will appear here." />
      ) : null}

      {view === 'menus' ? (
        menus.length ? menus.map((m) => (
          <Pressable key={m.restaurant_id} onPress={() => actOnMenu(m)}
            style={({ pressed }) => [styles.box, { backgroundColor: t.card, borderColor: t.line, opacity: pressed ? 0.6 : 1 }]}>
            <Text style={{ color: t.ink, fontWeight: '700' }}>
              {m.restaurant}{m.postcode ? <Text style={{ color: t.muted, fontWeight: '400' }}> · {m.postcode}</Text> : null}
            </Text>
            <Text style={{ color: t.lo, fontWeight: '600' }}>{m.problems.join(' · ')}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {m.reports === 1 ? '1 report' : `${m.reports} reports`} · latest by @{m.reported_by ?? 'someone'} on {new Date(m.last_reported).toLocaleDateString('en-GB')}
            </Text>
          </Pressable>
        )) : <Empty title="No menu reports" body={'When someone taps "Something wrong with this menu?", it shows up here.'} />
      ) : null}

      {view === 'numbers' && !stats ? <Button variant="ghost" title="Loading…" onPress={() => {}} disabled /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 14, gap: 2 },
  box: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  heading: { fontWeight: '700', fontSize: 15 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  row: { flexDirection: 'row', gap: 8 },
  lookup: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
