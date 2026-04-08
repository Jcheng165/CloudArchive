import AuthForm from "@/components/AuthForm";

/**
 * Login page.
 *
 * Uses `AuthForm` to initiate the passwordless OTP flow; session cookies are issued server-side
 * after OTP verification to keep auth state HTTP-only.
 */
const LoginPage = () => <AuthForm type="login" />;

export default LoginPage;
