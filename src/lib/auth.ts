import NextAuth, { type NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

const config = {
  session: { strategy: 'jwt' },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    signIn({ user }) {
      const email = user.email?.toLowerCase()
      return Boolean(email && allowedEmails.size > 0 && allowedEmails.has(email))
    },
  },
  pages: { signIn: '/login' },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(config)
