export interface User {
  id: string
  email: string
  username: string
  avatar_url: string | null
  bio: string | null
  created_at: string
}

export interface AuthResponse {
  user: User
  access_token: string
  token_type: 'bearer'
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput extends LoginInput {
  username: string
}
