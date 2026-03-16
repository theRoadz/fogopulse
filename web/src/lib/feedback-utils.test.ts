import { formatRelativeTime, truncateWallet, sanitizeInput } from './feedback-utils'

describe('formatRelativeTime', () => {
  it('should show "just now" for recent timestamps', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now)).toBe('just now')
  })

  it('should show minutes for timestamps under an hour', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    expect(formatRelativeTime(tenMinAgo)).toBe('10m ago')
  })

  it('should show hours for timestamps under a day', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago')
  })

  it('should show days for timestamps over a day', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago')
  })
})

describe('truncateWallet', () => {
  it('should truncate a wallet address', () => {
    expect(truncateWallet('HkSz5Avhwn29eeK1fkBGeCtfo1L7uTwct4Wgu5bbfy9U')).toBe('HkSz...fy9U')
  })
})

describe('sanitizeInput', () => {
  it('should strip HTML tags', () => {
    expect(sanitizeInput('<script>alert("xss")</script>Hello')).toBe('alert("xss")Hello')
  })

  it('should leave plain text unchanged', () => {
    expect(sanitizeInput('Normal text here')).toBe('Normal text here')
  })
})
