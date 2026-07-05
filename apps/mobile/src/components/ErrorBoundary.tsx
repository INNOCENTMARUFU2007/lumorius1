import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  screenName?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ errorInfo: info });
    this.logError(error, info);
    this.props.onError?.(error, info);
  }

  private logError(error: Error, info: ErrorInfo) {
    const payload = {
      screen    : this.props.screenName ?? 'unknown',
      message   : error.message,
      stack     : error.stack,
      component : info.componentStack,
      timestamp : new Date().toISOString(),
    };
    // Structured error reporting — no raw console.error in production paths
    if (__DEV__) {
      // In dev, show full detail in the RN debugger / Metro console
      console.warn('[ErrorBoundary]', JSON.stringify(payload, null, 2));
    } else {
      // Production: send to observability endpoint (fire-and-forget)
      this.reportToServer(payload).catch(() => undefined);
    }
  }

  private async reportToServer(payload: Record<string, unknown>) {
    try {
      const { api } = await import('../../src/services/api');
      await api.post('/errors/report', payload);
    } catch {
      // Intentionally swallowed — error reporting must never crash the app
    }
  }

  private reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <View style={styles.container}>
        <Ionicons name="warning-outline" size={56} color="#ef4444" />
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          {this.props.screenName
            ? `An error occurred in ${this.props.screenName}`
            : 'An unexpected error occurred'}
        </Text>

        {__DEV__ && this.state.error && (
          <ScrollView style={styles.details} contentContainerStyle={{ padding: 12 }}>
            <Text style={styles.errorText}>{this.state.error.message}</Text>
            {this.state.errorInfo && (
              <Text style={styles.stackText} numberOfLines={20}>
                {this.state.errorInfo.componentStack}
              </Text>
            )}
          </ScrollView>
        )}

        <TouchableOpacity style={styles.retryBtn} onPress={this.reset}>
          <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container : { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title     : { fontSize: 20, fontWeight: '700', color: '#ffffff', marginTop: 16, textAlign: 'center' },
  subtitle  : { fontSize: 14, color: '#6b7280', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  details   : { maxHeight: 200, width: '100%', backgroundColor: '#111827', borderRadius: 8, marginTop: 16 },
  errorText : { fontSize: 13, color: '#f87171', fontFamily: 'Courier New' },
  stackText : { fontSize: 11, color: '#6b7280', marginTop: 8, fontFamily: 'Courier New' },
  retryBtn  : { flexDirection: 'row', backgroundColor: '#7c3aed', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 24, alignItems: 'center' },
  retryText : { color: '#fff', fontWeight: '600', fontSize: 15 },
});

export default ErrorBoundary;
