import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';

interface SearchResult {
  id: string;
  content: string;
  documentTitle: string;
  score: number;
}

export default function BrainScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/documents/search', { query, limit: 10 });
      setResults(res.data.data ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResults([{ id: "error", content: `Search failed: ${msg}`, documentTitle: "Error", score: 0 }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Company Brain</Text>
      <Text style={styles.subtitle}>Search your organisation's knowledge</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask anything about your company..."
          placeholderTextColor="#6b7280"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={search}>
          <Ionicons name="search" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator color="#a855f7" size="large" style={{ marginTop: 32 }} />
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={styles.resultCard}>
            <Text style={styles.docTitle}>{item.documentTitle}</Text>
            <Text style={styles.content} numberOfLines={4}>
              {item.content}
            </Text>
            <Text style={styles.score}>
              Relevance: {(item.score * 100).toFixed(0)}%
            </Text>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              Search your documents, meetings, and notes.
            </Text>
          ) : null
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  input: {
    flex: 1,
    backgroundColor: '#111827',
    color: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  searchBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  docTitle: { fontSize: 13, color: '#a855f7', fontWeight: '600', marginBottom: 6 },
  content: { fontSize: 14, color: '#d1d5db', lineHeight: 20 },
  score: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 64, fontSize: 15 },
});
