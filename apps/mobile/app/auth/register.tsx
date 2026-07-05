import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { api } from '../../src/services/api';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!firstName || !email || !password || !orgName) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        firstName,
        lastName,
        email,
        password,
        organizationName: orgName,
      });
      const { accessToken, refreshToken } = res.data.data;
      await SecureStore.setItemAsync('access_token', accessToken);
      await SecureStore.setItemAsync('refresh_token', refreshToken);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert(
        'Registration Failed',
        err?.response?.data?.message ?? 'Could not create account.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0a0a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Start your Lumorius journey</Text>

        <Text style={styles.label}>First Name *</Text>
        <TextInput style={styles.input} placeholder="Jane" placeholderTextColor="#6b7280" value={firstName} onChangeText={setFirstName} />

        <Text style={styles.label}>Last Name</Text>
        <TextInput style={styles.input} placeholder="Doe" placeholderTextColor="#6b7280" value={lastName} onChangeText={setLastName} />

        <Text style={styles.label}>Work Email *</Text>
        <TextInput style={styles.input} placeholder="jane@company.com" placeholderTextColor="#6b7280" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>Password *</Text>
        <TextInput style={styles.input} placeholder="Min. 8 characters" placeholderTextColor="#6b7280" value={password} onChangeText={setPassword} secureTextEntry />

        <Text style={styles.label}>Organization Name *</Text>
        <TextInput style={styles.input} placeholder="Acme Inc." placeholderTextColor="#6b7280" value={orgName} onChangeText={setOrgName} />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.btnText}>Create Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 4, marginTop: 16 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 28 },
  label: { fontSize: 13, color: '#9ca3af', marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: '#111827',
    color: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 16,
  },
  btn: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { backgroundColor: '#4c1d95' },
  btnText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  link: { textAlign: 'center', color: '#a855f7', marginTop: 20, fontSize: 14 },
});
