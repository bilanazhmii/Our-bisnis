// Vercel serverless function: exposes Supabase public config to the frontend.
// Required environment variables (Vercel Project Settings -> Environment Variables):
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  var supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  var supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({
      error: "Missing Supabase environment variables",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: ""
    });
    return;
  }

  res.status(200).json({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey
  });
};
