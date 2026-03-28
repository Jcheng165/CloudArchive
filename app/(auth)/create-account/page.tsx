import AuthForm from "@/components/AuthForm";

/**
 * Create account page.
 *
 * Sends OTP first; the Users collection profile is created in `verifySecret` only after the code is verified.
 * Session state is persisted via HTTP-only cookies.
 */
const CreateAccountPage = () => <AuthForm type="create-account" />;

export default CreateAccountPage;
