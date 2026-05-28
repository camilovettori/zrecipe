import { create } from 'zustand'
import type { Tenant } from '@/types'

interface AppState {
  sidebarCollapsed: boolean
  mobileSidebarOpen: boolean
  commandSearchOpen: boolean
  currentTenant: Tenant | null
  // Cached tenant ID — populated on first successful tenant lookup so that
  // subsequent calls to resolveTenantId() skip the network round-trip.
  tenantId: string | null
  toggleSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
  setCommandSearchOpen: (open: boolean) => void
  setTenant: (tenant: Tenant | null) => void
  setTenantId: (id: string | null) => void
}

export const useAppStore = create<AppState>()((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  commandSearchOpen: false,
  currentTenant: null,
  tenantId: null,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setCommandSearchOpen: (open) => set({ commandSearchOpen: open }),
  setTenant: (tenant) => set({ currentTenant: tenant }),
  setTenantId: (id) => set({ tenantId: id }),
}))
