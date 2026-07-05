import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../src/services/api';

export default function DashboardScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['mobile', 'dashboard'],
    queryFn: async () => {
      const res = await api.get('/analytics/founder-dashboard');
      return res.data.data;
    },
    retry: false,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>
            Lumorius AI
          </Text>
          <Text style={{ color: '#94a3b8', marginTop: 4, fontSize: 14 }}>
            Your AI Operating System
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#6366f1" size="large" />
        ) : (
          <>
            {/* Stats Row */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              {[
                {
                  label: 'Open Tasks',
                  value: data?.summary?.tasks
                    ? Number(data.summary.tasks.total) - Number(data.summary.tasks.completed)
                    : 0,
                  color: '#3b82f6',
                },
                {
                  label: 'Docs Indexed',
                  value: data?.summary?.documents?.indexed ?? 0,
                  color: '#8b5cf6',
                },
              ].map(({ label, value, color }) => (
                <View
                  key={label}
                  style={{
                    flex: 1,
                    backgroundColor: '#1e293b',
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: '#334155',
                  }}
                >
                  <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>{label}</Text>
                  <Text style={{ color, fontSize: 32, fontWeight: '800' }}>{value}</Text>
                </View>
              ))}
            </View>

            {/* Urgent Tasks */}
            {data?.urgentTasks && data.urgentTasks.length > 0 && (
              <View style={{ backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                  🔥 Urgent Tasks
                </Text>
                {data.urgentTasks.slice(0, 4).map((task: Record<string, unknown>) => (
                  <View
                    key={task.id as string}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderColor: '#334155',
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: task.priority === 'urgent' ? '#ef4444' : '#f97316',
                      }}
                    />
                    <Text style={{ color: '#e2e8f0', flex: 1, fontSize: 14 }} numberOfLines={1}>
                      {task.title as string}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Risks */}
            {data?.risks && data.risks.length > 0 && (
              <View style={{ backgroundColor: '#1e293b', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334155' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                  ⚠️ AI-Detected Risks
                </Text>
                {data.risks.slice(0, 2).map((risk: Record<string, string>, i: number) => (
                  <View key={i} style={{ marginBottom: 10 }}>
                    <Text style={{ color: '#f87171', fontWeight: '600', fontSize: 13 }}>{risk.title}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{risk.recommendation}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
