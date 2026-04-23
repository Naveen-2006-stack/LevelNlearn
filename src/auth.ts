import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

const ALLOWED_EMAIL_DOMAIN = "@srmist.edu.in"

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isAllowedCollegeEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ALLOWED_EMAIL_DOMAIN)
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const normalizedEmail = normalizeEmail(credentials.email as string)
        if (!isAllowedCollegeEmail(normalizedEmail)) return null

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        })

        if (!user || !user.password) return null

        const passwordsMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (passwordsMatch) return user

        return null
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false
      return isAllowedCollegeEmail(user.email)
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
