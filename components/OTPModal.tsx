"use client";

// Second step after `AuthForm`: user enters 6-digit code; `verifySecret` sets cookie and redirects home.
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { sendEmailOTP, verifySecret } from "@/lib/actions/user.actions";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Client-side cooldown before “Click to resend” is enabled again (pairs with `sendEmailOTP` rate limits). */
const RESEND_COOLDOWN_SEC = 60;

/**
 * OTP verification modal — second step after the auth form sends an email OTP (`createAccount` / `signInUser`).
 *
 * **Flow**
 * - User enters 6 digits; `verifySecret` creates the session cookie and redirects home.
 * - **Resend** calls `sendEmailOTP`; cooldown resets to `RESEND_COOLDOWN_SEC` immediately on click so double-clicks
 *   cannot spam the API (cooldown stays even if the request fails).
 *
 * **Radix `AlertDialog`**
 * - Keep a **screen-reader-only** `AlertDialogCancel` so focus/open behavior is reliable (Radix + React 19).
 * - Use a normal **`Button`** for submit, not `AlertDialogAction`, so async `verifySecret` is not interrupted.
 *
 * **Layout**
 * - Header/footer override default `sm:` alignment so the dialog stays **centered** on phones and tablets.
 * - Long emails: `break-words`. Countdown: brand-colored, `tabular-nums`, `whitespace-nowrap` on the timer phrase.
 *
 * **Props**
 * - `mode` + `fullName`: passed to `verifySecret` — Users profile is created **after** OTP only for `create-account`.
 */
const OTPModal = ({
  accountId,
  email,
  mode = "login",
  fullName,
}: {
  accountId: string;
  email: string;
  mode?: "login" | "create-account";
  fullName?: string;
}) => {
  const router = useRouter();
  // `password` holds the 6 OTP digits (InputOTP naming from shadcn).
  const [isOpen, setIsOpen] = useState(true);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(RESEND_COOLDOWN_SEC);

  useEffect(() => {
    const id = setInterval(() => {
      setResendSecondsLeft((s) => (s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await verifySecret({
        accountId,
        password,
        mode,
        fullName,
      });

      if (result) {
        router.push("/");
      }
    } catch (error) {
      console.log("Failed to verify OTP", error);
    }

    setIsLoading(false);
  };

  // Re-triggers Appwrite email OTP; cooldown resets immediately on click so rapid double-clicks cannot spam.
  const handleResendOtp = async () => {
    if (resendSecondsLeft > 0) return;
    setResendSecondsLeft(RESEND_COOLDOWN_SEC);
    try {
      await sendEmailOTP({ email });
    } catch {
      // Keep cooldown even on failure to protect Appwrite rate limits.
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="shad-alert-dialog">
        {/* Keep center alignment at all breakpoints (AlertDialogHeader defaults to sm:text-left). */}
        <AlertDialogHeader className="relative flex justify-center text-center sm:text-center">
          <AlertDialogTitle className="h2 text-center">
            Enter Your OTP
            <Image
              src="/assets/icons/close-dark.svg"
              alt="close"
              width={20}
              height={20}
              onClick={() => setIsOpen(false)}
              className="otp-close-button"
            />
          </AlertDialogTitle>

          <AlertDialogDescription className="subtitle-2 text-center text-light-100">
            We&apos;ve sent a code to{" "}
            <span className="break-words pl-1 text-brand">{email}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* 6-slot OTP; value synced to `password` state */}
        <InputOTP maxLength={6} value={password} onChange={setPassword}>
          <InputOTPGroup className="shad-otp">
            <InputOTPSlot index={0} className="shad-otp-slot" />
            <InputOTPSlot index={1} className="shad-otp-slot" />
            <InputOTPSlot index={2} className="shad-otp-slot" />
            <InputOTPSlot index={3} className="shad-otp-slot" />
            <InputOTPSlot index={4} className="shad-otp-slot" />
            <InputOTPSlot index={5} className="shad-otp-slot" />
          </InputOTPGroup>
        </InputOTP>

        {/* Submit + resend link (not AlertDialogAction — avoids Radix closing before async finishes). */}
        {/* Single column on all sizes — overrides default sm:flex-row so layout matches mobile. */}
        <AlertDialogFooter className="flex flex-col sm:flex-col sm:justify-center sm:space-x-0">
          <div className="flex w-full flex-col gap-4">
            <Button
              type="button"
              onClick={handleSubmit}
              className="shad-submit-btn h-12"
            >
              Submit
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

            <div className="subtitle-2 mt-2 px-1 text-center text-light-100 sm:px-0">
              Didn&apos;t get a code?{" "}
              {resendSecondsLeft > 0 ? (
                <span className="inline-block text-light-100">
                  <span className="whitespace-nowrap">
                    Resend in{" "}
                    <span className="font-semibold tabular-nums text-brand">
                      {resendSecondsLeft}s
                    </span>
                  </span>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  className="pl-1 text-brand"
                  onClick={handleResendOtp}
                >
                  Click to resend
                </Button>
              )}
            </div>
          </div>
        </AlertDialogFooter>

        {/* Required for Radix focus management; keep visible-only close on the title icon. */}
        <AlertDialogCancel className="sr-only" type="button">
          Cancel
        </AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default OTPModal;
