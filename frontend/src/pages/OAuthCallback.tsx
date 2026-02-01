import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";

function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const provider = searchParams.get("provider");
    const success = searchParams.get("success");

    if (success === "true" && provider) {
      toast.success(
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} connected successfully!`
      );
      // Redirect back to dashboard
      setTimeout(() => {
        navigate("/dashboard");
      }, 1000);
    } else {
      toast.error("OAuth connection failed. Please try again.");
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    }
  }, [searchParams, navigate]);

  return (
    <div className="h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white text-lg">Completing OAuth connection...</p>
        <p className="text-gray-400 text-sm mt-2">Please wait while we redirect you back.</p>
      </div>
    </div>
  );
}

export default OAuthCallback;

