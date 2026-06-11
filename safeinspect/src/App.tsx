import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { AppRouter } from '@/router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: 2 minutes (inspections don't change that fast)
      staleTime: 2 * 60 * 1000,
      // Retry failed requests up to 2 times
      retry: 2,
      // Re-fetch on window focus to catch changes made on another device
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
