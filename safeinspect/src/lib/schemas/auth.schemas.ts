import { z } from 'zod'

// ─── Shared field rules ───────────────────────────────────────

const emailField = z
  .string()
  .min(1, 'Email is required')
  .email('Enter a valid email address')

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password too long')

// ─── Sign In ─────────────────────────────────────────────────

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
})
export type SignInFormValues = z.infer<typeof signInSchema>

// ─── Sign Up ─────────────────────────────────────────────────

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Name too long'),
    email: emailField,
    position: z.string().max(100).optional(),
    accreditationNumber: z.string().max(50).optional(),
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type SignUpFormValues = z.infer<typeof signUpSchema>

// ─── Magic Link ──────────────────────────────────────────────

export const magicLinkSchema = z.object({
  email: emailField,
})
export type MagicLinkFormValues = z.infer<typeof magicLinkSchema>

// ─── Reset Password ──────────────────────────────────────────

export const resetRequestSchema = z.object({
  email: emailField,
})
export type ResetRequestFormValues = z.infer<typeof resetRequestSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
