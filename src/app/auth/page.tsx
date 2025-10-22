import { redirect } from 'next/navigation'

export default function AuthIndexRedirect() {
  // Any visit to /auth goes to the standard email+password login page
  redirect('/login')
}

