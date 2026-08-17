// Supabase Configuration Example
// Copy file ini dan rename ke config.js, lalu isi dengan kredensial Supabase Anda
// Dapatkan kredensial dari: https://supabase.com/dashboard/project/_/settings/api

window.SUPABASE_URL = 'https://your-project-id.supabase.co';
window.SUPABASE_ANON_KEY = 'your-anon-key-here';

// Opsional: Service role key untuk admin operations
// window.SUPABASE_SERVICE_ROLE_KEY = 'your-service-role-key-here';

// Email/SMTP Configuration
// Configure SMTP di Supabase Dashboard: Authentication → Settings → SMTP Settings
// Default: Supabase built-in email service (untuk development)
// Production: Gunakan SMTP provider seperti SendGrid, Mailgun, dll
//
// Tidak perlu konfigurasi SMTP di sini untuk Supabase built-in service
// SMTP configuration dilakukan langsung di Supabase Dashboard
