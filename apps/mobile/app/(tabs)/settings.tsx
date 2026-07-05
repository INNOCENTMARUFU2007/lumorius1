import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

interface SettingRow {
  label: string;
  icon: string;
  onPress: () => void;
  danger?: boolean;
}

export default function SettingsScreen() {
  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('access_token');
          await SecureStore.deleteItemAsync('refresh_token');
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const rows: SettingRow[] = [
    {
      label: 'Profile',
      icon: 'person-outline',
      onPress: () => {},
    },
    {
      label: 'Organization',
      icon: 'business-outline',
      onPress: () => {},
    },
    {
      label: 'Notifications',
      icon: 'notifications-outline',
      onPress: () => {},
    },
    {
      label: 'Security & MFA',
      icon: 'shield-checkmark-outline',
      onPress: () => {},
    },
    {
      label: 'Billing & Plans',
      icon: 'card-outline',
      onPress: () => {},
    },
    {
      label: 'Sign Out',
      icon: 'log-out-outline',
      onPress: handleLogout,
      danger: true,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color="#a855f7" />
        </View>
        <Text style={styles.name}>Your Account</Text>
        <Text style={styles.org}>Lumorius Organization</Text>
      </View>

      <View style={styles.section}>
        {rows.map((row, i) => (
          <TouchableOpacity
            key={row.label}
            style={[
              styles.row,
              i === 0 && styles.rowFirst,
              i === rows.length - 1 && styles.rowLast,
            ]}
            onPress={row.onPress}
          >
            <Ionicons
              name={row.icon as any}
              size={20}
              color={row.danger ? '#ef4444' : '#a855f7'}
            />
            <Text style={[styles.rowLabel, row.danger && styles.rowLabelDanger]}>
              {row.label}
            </Text>
            {!row.danger && (
              <Ionicons name="chevron-forward" size={16} color="#6b7280" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.version}>Lumorius v1.0.0 · INMARTECH PVT LTD</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginBottom: 20 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
  org: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  section: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  rowFirst: {},
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, fontSize: 15, color: '#d1d5db' },
  rowLabelDanger: { color: '#ef4444' },
  version: {
    textAlign: 'center',
    color: '#374151',
    fontSize: 12,
    marginTop: 32,
  },
});
