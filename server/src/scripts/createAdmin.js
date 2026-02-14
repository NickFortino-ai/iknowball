import { supabase } from '../config/supabase.js'

async function createAdmin() {
  const email = 'admin@iknowball.club'
  const password = 'iknowball140!'
  const username = 'admin'

  // Create auth user via Supabase admin API
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    console.error('Failed to create auth user:', authError.message)
    process.exit(1)
  }

  console.log('Auth user created:', authData.user.id)

  // Create users row with is_admin = true
  const { error: userError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      username,
      display_name: 'Admin',
      is_admin: true,
    })

  if (userError) {
    console.error('Failed to create user profile:', userError.message)
    process.exit(1)
  }

  console.log('')
  console.log('Admin account created successfully!')
  console.log('Email:    ', email)
  console.log('Password: ', password)
  console.log('Username: ', username)
  console.log('')
  console.log('Use the email + password to sign in on the login page.')
}

createAdmin()
