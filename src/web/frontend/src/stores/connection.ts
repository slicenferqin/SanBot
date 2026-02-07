import { create } from 'zustand'
import type { ProviderInfo } from '@/lib/ws-types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface ConnectionState {
  status: ConnectionStatus
  ws: WebSocket | null
  sessionId: string | null
  providerId: string
  model: string
  temperature: number
  providers: ProviderInfo[]
  models: string[]

  setStatus: (status: ConnectionStatus) => void
  setWs: (ws: WebSocket | null) => void
  setSessionId: (sessionId: string | null) => void
  setProviderConfig: (config: {
    providerId: string
    model: string
    temperature: number
    providers: ProviderInfo[]
    models: string[]
  }) => void
  setModels: (models: string[]) => void
  updateLLM: (providerId: string, model: string, temperature?: number) => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: 'disconnected',
  ws: null,
  sessionId: null,
  providerId: '',
  model: '',
  temperature: 0.7,
  providers: [],
  models: [],

  setStatus: (status) => set({ status }),
  setWs: (ws) => set({ ws }),
  setSessionId: (sessionId) => set({ sessionId }),

  setProviderConfig: (config) => set({
    providerId: config.providerId,
    model: config.model,
    temperature: config.temperature,
    providers: config.providers,
    models: config.models,
  }),

  setModels: (models) => set({ models }),

  updateLLM: (providerId, model, temperature) => {
    const ws = get().ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'llm_update',
        providerId,
        model,
        temperature,
      }))
    }
  },
}))
