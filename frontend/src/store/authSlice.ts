import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface User {
  id: string
  email: string
  name: string
  createdAt: string
  updatedAt: string
}

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  token: string | null
}

// Check localStorage for existing auth data
const token = localStorage.getItem('auth_token')
const userDataString = localStorage.getItem('user_data')
const userData = userDataString ? JSON.parse(userDataString) : null

const initialState: AuthState = {
  isAuthenticated: !!token && !!userData,
  user: userData,
  token: token,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login: (state, action: PayloadAction<{ user: User; token: string }>) => {
      state.isAuthenticated = true
      state.user = action.payload.user
      state.token = action.payload.token
      
      // Persist to localStorage
      localStorage.setItem('auth_token', action.payload.token)
      localStorage.setItem('user_data', JSON.stringify(action.payload.user))
    },
    logout: (state) => {
      state.isAuthenticated = false
      state.user = null
      state.token = null
      
      // Clear localStorage
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_data')
    },
  },
})

export const { login, logout } = authSlice.actions
export default authSlice.reducer

