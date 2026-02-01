import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAppDispatch } from "../store/hooks";
import { login } from "../store/authSlice";
import { authAPI } from "../api/auth";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authAPI.login({ email, password });
      
      // Dispatch login action with user data and token
      dispatch(login({ user: response.user, token: response.token }));
      
      // Show success toast
      toast.success(response.message || "Login successful!");
      
      // Navigate to dashboard
      navigate("/dashboard");
    } catch (error: any) {
      // Handle error responses
      const errorMessage = 
        error.response?.data?.message || 
        error.response?.data?.error ||
        "Login failed. Please try again.";
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Login Form */}
        <div className="bg-gray-800 p-8 border border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 text-white placeholder-gray-400 focus:outline-none"
              />
            </div>

            {/* Password Input */}
            <div>
              <input
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 text-white placeholder-gray-400 focus:outline-none"
              />
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer bg-purple-600 text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          {/* Forgot Password */}
          <div className="mt-6">
            <Link to="/forgot-password" className="text-sm text-gray-400">
              Forgot Your Password?
            </Link>
          </div>

          {/* Sign Up Link */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <p className="text-gray-400 text-sm">
              Don't have an account?{" "}
              <Link to="/signup" className="text-purple-400 font-semibold">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
