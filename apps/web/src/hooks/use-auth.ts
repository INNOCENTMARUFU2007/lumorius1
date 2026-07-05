'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getCurrentUser, login, logout, register, getAccessToken, getRefreshToken } from '@/lib/auth';

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getCurrentUser,
    enabled: !!getAccessToken(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password, mfaCode }: { email: string; password: string; mfaCode?: string }) =>
      login(email, password, mfaCode),
    onSuccess: (data) => {
      if (!data.mfaRequired) {
        queryClient.setQueryData(['auth', 'me'], data.user);
        router.push('/dashboard');
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data.user);
      router.push('/dashboard');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => logout(getRefreshToken() ?? ''),
    onSuccess: () => {
      queryClient.clear();
      router.push('/login');
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation,
    register: registerMutation,
    logout: logoutMutation,
  };
}
