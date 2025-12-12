import { issuer } from "@openauthjs/openauth"
import { PasswordProvider } from "@openauthjs/openauth/provider/password"
import { PasswordUI } from "@openauthjs/openauth/ui/password"
import { MemoryStorage } from "@openauthjs/openauth/storage/memory"
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare"
import { subjects } from "./subjects"

/**
 * Simple user lookup/creation logic
 * In production, this would query your user database service
 * For now, returns a deterministic hash-based user ID
 */
async function getOrCreateUser(email: string): Promise<string> {
  // Create a simple hash-based user ID for development
  const encoder = new TextEncoder()
  const data = encoder.encode(email)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
  return `user_${hashHex.slice(0, 16)}`
}

export default issuer({
  subjects,
  
  // Use CloudflareStorage for production, MemoryStorage for local dev
  storage: (globalThis as any).MAXHILL_AUTH 
    ? CloudflareStorage({ namespace: (globalThis as any).MAXHILL_AUTH })
    : MemoryStorage({
        persist: "./.wrangler/state/auth-storage.json"
      }),
  
  providers: {
    password: PasswordProvider(
      PasswordUI({
        sendCode: async (email, code) => {
          // For local dev, log to console
          // In production, you would send an email here
          console.log(`\n================================`)
          console.log(`Verification code for: ${email}`)
          console.log(`Code: ${code}`)
          console.log(`================================\n`)
        },
      }),
    ),
  },
  
  success: async (ctx, value) => {
    if (value.provider === "password") {
      const userID = await getOrCreateUser(value.email)
      return ctx.subject("user", { userID })
    }
    throw new Error("Invalid provider")
  },
})
