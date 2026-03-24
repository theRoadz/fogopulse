/**
 * @jest-environment jsdom
 */

// Mock TanStack Query
const mockQueryResult = {
  data: { allowEpochCreation: true },
  isLoading: false,
  error: null,
}

const mockMutationResult = {
  mutate: jest.fn(),
  isPending: false,
}

const mockInvalidateQueries = jest.fn()

let capturedMutationOpts: { onSuccess?: () => void; onError?: (err: Error) => void } = {}

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn().mockImplementation(() => mockQueryResult),
  useMutation: jest.fn().mockImplementation((opts: { mutationFn: unknown; onSuccess?: () => void; onError?: (err: Error) => void }) => {
    capturedMutationOpts = opts
    mockMutationResult.mutate = jest.fn().mockImplementation(async (input: unknown) => {
      await (opts.mutationFn as (input: unknown) => Promise<unknown>)(input)
    })
    return mockMutationResult
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: { toBase58: () => 'admin123' },
  }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useAdminSettings, useUpdateAdminSettings } from './use-admin-settings'

describe('useAdminSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('should call useQuery with correct config', () => {
    renderHook(() => useAdminSettings())

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['admin-settings'],
        staleTime: 10_000,
        refetchInterval: 30_000,
      }),
    )
  })

  it('queryFn should return defaults on fetch failure', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })

    const queryCall = (useQuery as jest.Mock).mock.calls[0]?.[0]
    if (!queryCall) {
      renderHook(() => useAdminSettings())
    }
    const latestCall = (useQuery as jest.Mock).mock.calls.at(-1)[0]
    const result = await latestCall.queryFn()

    expect(result).toEqual({ allowEpochCreation: true })
  })

  it('queryFn should return data on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ allowEpochCreation: false }),
    })

    renderHook(() => useAdminSettings())
    const latestCall = (useQuery as jest.Mock).mock.calls.at(-1)[0]
    const result = await latestCall.queryFn()

    expect(result).toEqual({ allowEpochCreation: false })
  })
})

describe('useUpdateAdminSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('should call PATCH with wallet query param', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ allowEpochCreation: false }),
    })

    renderHook(() => useUpdateAdminSettings())
    await mockMutationResult.mutate({ allowEpochCreation: false })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin-settings?wallet=admin123',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ allowEpochCreation: false }),
      }),
    )
  })

  it('should show success toast and invalidate queries on success', () => {
    const { toast } = jest.requireMock('sonner')

    renderHook(() => useUpdateAdminSettings())
    capturedMutationOpts.onSuccess?.()

    expect(toast.success).toHaveBeenCalledWith('Admin setting updated')
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['admin-settings'],
    })
  })

  it('should show error toast on mutation failure', () => {
    const { toast } = jest.requireMock('sonner')

    renderHook(() => useUpdateAdminSettings())
    capturedMutationOpts.onError?.(new Error('Forbidden'))

    expect(toast.error).toHaveBeenCalledWith('Forbidden')
  })
})
