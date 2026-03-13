import '@testing-library/jest-dom'

// Polyfill for TextEncoder/TextDecoder required by @solana/web3.js
import { TextEncoder, TextDecoder } from 'util'

global.TextEncoder = TextEncoder
// @ts-expect-error TextDecoder types mismatch between util and DOM
global.TextDecoder = TextDecoder
