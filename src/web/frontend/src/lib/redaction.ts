const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|password|secret|authorization)/i

function maskSecret(raw: string): string {
  const value = raw.trim()
  if (!value) return '***'

  if (value.length <= 6) {
    return '***'
  }

  const prefixLength = Math.min(4, Math.max(2, Math.floor(value.length * 0.25)))
  const suffixLength = Math.min(3, Math.max(2, Math.floor(value.length * 0.15)))

  const prefix = value.slice(0, prefixLength)
  const suffix = value.slice(-suffixLength)
  return `${prefix}***${suffix}`
}

export function redactSensitiveText(text: string): string {
  if (!text) return text

  let redacted = text

  redacted = redacted.replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi, (_, prefix: string, token: string) => {
    return `${prefix}${maskSecret(token)}`
  })

  redacted = redacted.replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, (token: string) => {
    return maskSecret(token)
  })

  redacted = redacted.replace(
    /((?:api[_-]?key|token|password)\s*[=:]\s*)([^\s"'&,;]+)/gi,
    (_, prefix: string, token: string) => `${prefix}${maskSecret(token)}`,
  )

  redacted = redacted.replace(
    /([?&](?:api[_-]?key|token|password)=)([^&\s]+)/gi,
    (_, prefix: string, token: string) => `${prefix}${maskSecret(token)}`,
  )

  return redacted
}

export function redactSensitiveValue(value: unknown, keyHint?: string): unknown {
  if (value == null) return value

  if (typeof value === 'string') {
    if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) {
      return maskSecret(value)
    }
    return redactSensitiveText(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveValue(entry))
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const output: Record<string, unknown> = {}

    for (const [entryKey, entryValue] of Object.entries(record)) {
      output[entryKey] = redactSensitiveValue(entryValue, entryKey)
    }

    return output
  }

  return value
}
