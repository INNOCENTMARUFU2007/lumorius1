import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';

interface Meeting {
  id: string;
  title: string;
  status: string;
  duration: number;
  createdAt: string;
  summary?: string;
}

export default function MeetingsScreen() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      const res = await api.get('/meetings');
      setMeetings(res.data.data ?? []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status: string) => {
    if (status === 'completed') return '#10b981';
    if (status === 'processing') return '#f59e0b';
    return '#6b7280';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meeting Intelligence</Text>
      <Text style={styles.subtitle}>AI-powered transcripts & insights</Text>

      {loading ? (
        <ActivityIndicator color="#a855f7" size="large" style={{ marginTop: 64 }} />
      ) : (
        <FlatList
          data={meetings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshing={loading}
          onRefresh={fetchMeetings}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="mic" size={18} color="#a855f7" />
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '22' }]}>
                  <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              {item.summary && (
                <Text style={styles.summary} numberOfLines={2}>
                  {item.summary}
                </Text>
              )}
              <View style={styles.meta}>
                <Text style={styles.metaText}>
                  <Ionicons name="time-outline" size={12} /> {item.duration ?? 0} min
                </Text>
                <Text style={styles.metaText}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No meetings yet. Upload a recording to get started.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#ffffff' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  summary: { fontSize: 13, color: '#9ca3af', lineHeight: 18, marginBottom: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 12, color: '#6b7280' },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 64, fontSize: 15 },
});
