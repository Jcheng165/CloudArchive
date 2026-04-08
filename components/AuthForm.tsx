"use client";

// Passwordless login / signup: sends Appwrite email OTP, then `OTPModal` verifies and sets session cookie.
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

import { createAccount, signInUser } from "@/lib/actions/user.actions";
import OTPModal from "./OTPModal";

// --- Types & validation (one schema factory: create-account requires full name) ---
/** Matches routes `/login` and `/create-account` and UI copy "Log in" / "Create account". */
type FormType = "login" | "create-account";

/**
 * Authentication schema factory.
 *
 * Why schema-on-type:
 * - Keeps a single form reusable for both login and create-account while enforcing
 *   the correct validation contract (e.g., `fullName` only required on create-account).
 * - Validation runs client-side for instant UX, but the **security boundary** remains
 *   server-side where OTP + session cookies are issued.
 */
const authFormSchema = (formType: FormType) => {
  return z.object({
    email: z.string().min(1, "Required").email("Invalid email address"),
    fullName:
      formType === "create-account"
        ? z.string().min(1, "Required").min(2, "At least 2 characters").max(50)
        : z.string().optional(),
  });
};

/**
 * Passwordless authentication entrypoint for CloudArchive (`/login`, `/create-account`).
 *
 * **Client component** — validation, loading, OTP modal visibility tied to `accountId` from server actions.
 *
 * **Security**
 * - No API keys in the browser. `createAccount` / `signInUser` start Appwrite email OTP; `OTPModal` calls
 *   `verifySecret`; sessions live in **HTTP-only** cookies.
 * - Generic error copy where appropriate to limit **user enumeration** (e.g. login).
 *
 * **OTP UX**
 * - `submitInFlightRef` blocks double-submit so two OTP sends don’t invalidate each other.
 * - `OTPModal` is mounted with `key={accountId}` so a new send gets a fresh modal instance (including resend cooldown).
 * - In the modal, **resend** uses a client-side cooldown (`OTPModal`); rate-limit / Appwrite errors from the first
 *   send may surface in `errorMessage` (see `user.actions` JSDoc).
 *
 * @param type — `"login"` vs `"create-account"` (routes and copy).
 */
const AuthForm = ({ type }: { type: FormType }) => {
  // `accountId` from server = Appwrite user id for OTP session; `submitInFlightRef` blocks double-send.
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  /** Prevents double submit before React re-renders (each new token can invalidate the prior OTP email). */
  const submitInFlightRef = useRef(false);

  const formSchema = authFormSchema(type);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
    },
  });

  // Step 1: `createAccount` / `signInUser` — only opens OTP modal when `accountId` is returned.
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setIsLoading(true);
    setErrorMessage("");

    try {
      const user =
        type === "create-account"
          ? await createAccount({
              fullName: values.fullName || "",
              email: values.email,
            })
          : await signInUser({ email: values.email });

      if (user?.accountId) {
        setAccountId(user.accountId);
      } else {
        const rawError = user?.error || "";
        const rateLimitHint =
          typeof rawError === "string" &&
          rawError.toLowerCase().includes("rate limit")
            ? " You’ve hit the OTP send limit. Wait a bit (often 10–60 min) and try again—don’t keep resending or recreating accounts."
            : "";

        setErrorMessage(
          (rawError ? `${rawError}${rateLimitHint}` : "") ||
            (type === "login"
              ? "Unable to send OTP for this email."
              : "Failed to create account. Please try again.")
        );
      }
    } catch {
      setErrorMessage(
        type === "login"
          ? "Failed to log in. Please try again."
          : "Failed to create account. Please try again."
      );
    } finally {
      submitInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* --- Email (+ optional name) form; link toggles between login and create-account --- */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="auth-form">
          <h1 className="form-title">
            {type === "login" ? "Log in" : "Create account"}
          </h1>

          {type === "create-account" && (
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <div className="shad-form-item">
                    <FormLabel className="shad-form-label">Full name</FormLabel>

                    <FormControl>
                      <Input
                        placeholder="Enter your full name"
                        className="shad-input"
                        {...field}
                      />
                    </FormControl>
                  </div>

                  <FormMessage className="shad-form-message" />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <div className="shad-form-item">
                  <FormLabel className="shad-form-label">Email</FormLabel>

                  <FormControl>
                    <Input
                      placeholder="Enter your email"
                      className="shad-input"
                      {...field}
                    />
                  </FormControl>
                </div>

                <FormMessage className="shad-form-message" />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="form-submit-button"
            disabled={isLoading}
          >
            {type === "login" ? "Log in" : "Create account"}

            {isLoading && (
              <Image
                src="/assets/icons/loader.svg"
                alt="loader"
                width={24}
                height={24}
                className="ml-2 animate-spin"
              />
            )}
          </Button>

          {errorMessage && <p className="error-message">*{errorMessage}</p>}

          <div className="body-2 flex justify-center">
            <p className="text-light-100">
              {type === "login"
                ? "Don't have an account?"
                : "Already have an account?"}
            </p>
            <Link
              href={type === "login" ? "/create-account" : "/login"}
              className="ml-1 font-medium text-brand"
            >
              {type === "login" ? "Create account" : "Log in"}
            </Link>
          </div>
        </form>
      </Form>

      {/* Step 2: `key={accountId}` remounts modal after a new OTP send so UI state resets cleanly. */}
      {accountId && (
        <OTPModal
          key={accountId}
          email={form.getValues("email")}
          accountId={accountId}
          mode={type === "create-account" ? "create-account" : "login"}
          fullName={
            type === "create-account" ? form.getValues("fullName") : undefined
          }
        />
      )}
    </>
  );
};

export default AuthForm;
